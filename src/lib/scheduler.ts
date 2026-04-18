import {
  Trainee,
  TrainingType,
  WeekConfig,
  ScheduledSession,
} from '@/store/useScheduleStore';

// ─── Utilities ───────────────────────────────────────────────────────────────

export function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format date in LOCAL timezone to avoid UTC offset shifting the date */
function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns 1=Mon … 7=Sun */
function getDayOfWeek(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

/** True if trainee has a free-slot covering [startMins, endMins] on that dayOfWeek */
function isFreeAt(
  trainee: Trainee,
  dayOfWeek: number,
  startMins: number,
  endMins: number
): boolean {
  return trainee.freeSlots
    .filter((s) => s.dayOfWeek === dayOfWeek)
    .some(
      (s) => timeToMins(s.startTime) <= startMins && timeToMins(s.endTime) >= endMins
    );
}

/** Total free minutes per trainee (used for sorting) */
function totalFreeMinutes(trainee: Trainee): number {
  return trainee.freeSlots.reduce(
    (acc, s) => acc + (timeToMins(s.endTime) - timeToMins(s.startTime)),
    0
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TimelineDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  slots: { start: string; end: string }[];
}

interface Group {
  trainees: string[];
  trainingTypeId: string;
  order: number;
}

export interface UnscheduledEntry {
  traineeId: string;
  trainingTypeId: string;
  order: number;
  reason: 'no_slot' | 'config_error' | 'concurrent_limit';
}

export interface ScheduleResult {
  sessions: ScheduledSession[];
  unscheduled: UnscheduledEntry[];
  stats: {
    totalSessions: number;
    avgGroupSize: number;
    totalTraineeDays: number;
    completionRate: number; // 0-100 as integer
    peakConcurrent: number; // C7: highest concurrent sessions observed
  };
}

// ─── Main Scheduler ──────────────────────────────────────────────────────────

export function runScheduler(
  trainees: Trainee[],
  trainingTypes: TrainingType[],
  weekConfigs: WeekConfig[],
  startDate: Date,
  maxWeeks = 8
): ScheduleResult {
  const weekConfig = weekConfigs[0];
  if (!weekConfig) {
    return {
      sessions: [],
      unscheduled: [],
      stats: { totalSessions: 0, avgGroupSize: 0, totalTraineeDays: 0, completionRate: 0 },
    };
  }

  // ── Build timeline ──────────────────────────────────────────────────────────
  const timeline: TimelineDay[] = [];
  for (let w = 0; w < maxWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + w * 7 + d);
      const dow = getDayOfWeek(date);
      const dayConfig = weekConfig.days.find((dc) => dc.dayOfWeek === dow && dc.enabled);
      if (dayConfig && dayConfig.slots.length > 0) {
        timeline.push({
          date: formatDateLocal(date),
          dayOfWeek: dow,
          slots: dayConfig.slots,
        });
      }
    }
  }

  const scheduledSessions: ScheduledSession[] = [];
  const unscheduled: UnscheduledEntry[] = [];

  // C2: traineeId → Set of dates already taken (1 session per trainee per day)
  const takenDates = new Map<string, Set<string>>();
  trainees.forEach((t) => takenDates.set(t.id, new Set()));

  // C6: date → list of booked [startMins, endMins] intervals (no overlap allowed globally)
  // Also used for C7 concurrent count
  const bookedIntervals = new Map<string, { start: number; end: number }[]>();

  // C7: max concurrent sessions from config (fallback to unlimited if not set)
  const maxConcurrent = weekConfig.maxConcurrentSessions ?? Infinity;

  // NEW: per-trainee minimum date for next session — ensures type-order is reflected in dates
  // After scheduling a session for trainee in type order k, their next session (order k+1)
  // must be on a date strictly AFTER this one.
  const traineeMinNextDate = new Map<string, string>();
  trainees.forEach((t) => traineeMinNextDate.set(t.id, ''));

  /** Count how many already-scheduled sessions overlap with [start, end] on this date (C7) */
  function countConcurrent(date: string, start: number, end: number): number {
    const intervals = bookedIntervals.get(date) ?? [];
    return intervals.filter((iv) => start < iv.end && end > iv.start).length;
  }

  function bookInterval(date: string, start: number, end: number) {
    const intervals = bookedIntervals.get(date) ?? [];
    intervals.push({ start, end });
    bookedIntervals.set(date, intervals);
  }

  // ── Process training types in order (topological layering) ─────────────────
  const sortedTypes = [...trainingTypes].sort((a, b) => a.order - b.order);

  for (const tType of sortedTypes) {
    // Collect pending units grouped by order (layer)
    const pendingByOrder = new Map<number, string[]>(); // order → traineeIds

    for (const trainee of trainees) {
      const relevant = trainee.requiredSessions
        .filter((s) => s.trainingTypeId === tType.id)
        .sort((a, b) => a.order - b.order);

      const next = relevant.find((s) => !s.completed);
      if (!next) continue;

      // C1: All previous orders must be completed
      const prevDone = relevant.filter((s) => s.order < next.order).every((s) => s.completed);
      if (!prevDone) continue;

      const list = pendingByOrder.get(next.order) ?? [];
      list.push(trainee.id);
      pendingByOrder.set(next.order, list);
    }

    const orders = [...pendingByOrder.keys()].sort((a, b) => a - b);

    for (const order of orders) {
      const ids = pendingByOrder.get(order)!;

      // Sort by least free time first (hardest-to-schedule → pivot)
      const sorted = [...ids].sort((a, b) => {
        const ta = trainees.find((t) => t.id === a)!;
        const tb = trainees.find((t) => t.id === b)!;
        return totalFreeMinutes(ta) - totalFreeMinutes(tb);
      });

      // ── Greedy group formation ────────────────────────────────────────────
      const remaining = [...sorted];
      const groups: Group[] = [];

      while (remaining.length > 0) {
        const pivot = remaining.shift()!;
        const group: string[] = [pivot];

        for (let i = 0; i < remaining.length && group.length < 4; ) {
          group.push(remaining[i]);
          remaining.splice(i, 1);
          // (We'll validate shared availability during slot assignment)
        }

        groups.push({ trainees: group, trainingTypeId: tType.id, order });
      }

      // ── Slot assignment (EDF-style) ────────────────────────────────────────
      for (const group of groups) {
        let assigned = false;

        outer: for (const day of timeline) {
          // C2: No trainee in this group can have an existing session today
          if (group.trainees.some((tid) => takenDates.get(tid)?.has(day.date))) continue;

          // DATE ORDER: This day must be AFTER the last scheduled day for all trainees in group
          if (group.trainees.some((tid) => {
            const minDate = traineeMinNextDate.get(tid) ?? '';
            return minDate !== '' && day.date <= minDate;
          })) continue;

          // Collect ALL valid candidate slots in this day, then pick the best one
          const candidates: { sessionStart: number; sessionEnd: number; concurrent: number }[] = [];

          for (const slot of day.slots) {
            const slotStart = timeToMins(slot.start);
            const slotEnd = timeToMins(slot.end);
            // C3: session must fit inside this slot
            if (slotEnd - slotStart < tType.duration) continue;

            const step = 30;
            for (let t = slotStart; t + tType.duration <= slotEnd; t += step) {
              const sessionStart = t;
              const sessionEnd = t + tType.duration;

              // C5: All trainees must be free
              const allFree = group.trainees.every((tid) => {
                const trainee = trainees.find((tr) => tr.id === tid)!;
                return isFreeAt(trainee, day.dayOfWeek, sessionStart, sessionEnd);
              });
              if (!allFree) continue;

              // C7: concurrent limit (C6 removed — overlap is now allowed up to maxConcurrent)
              const concurrent = countConcurrent(day.date, sessionStart, sessionEnd);
              if (concurrent >= maxConcurrent) continue;

              candidates.push({ sessionStart, sessionEnd, concurrent });
            }
          }

          if (candidates.length === 0) continue;

          // Prefer slots with MORE existing overlap (minimizes total wall-clock time)
          // Tiebreak: earlier start time
          candidates.sort((a, b) => b.concurrent - a.concurrent || a.sessionStart - b.sessionStart);
          const best = candidates[0];

          // ✅ Assign
          scheduledSessions.push({
            id: crypto.randomUUID(),
            date: day.date,
            startTime: minsToTime(best.sessionStart),
            endTime: minsToTime(best.sessionEnd),
            trainingTypeId: tType.id,
            trainingOrder: order,
            traineeIds: [...group.trainees],
            status: 'scheduled',
          });

          group.trainees.forEach((tid) => {
            takenDates.get(tid)!.add(day.date);
            const current = traineeMinNextDate.get(tid) ?? '';
            if (day.date >= current) traineeMinNextDate.set(tid, day.date);
          });
          bookInterval(day.date, best.sessionStart, best.sessionEnd);
          assigned = true;
          break outer;
        }

        if (!assigned) {
          // Try to split group into solo sessions
          for (const tid of group.trainees) {
            let soloAssigned = false;

            soloOuter: for (const day of timeline) {
              if (takenDates.get(tid)?.has(day.date)) continue;

              const minDate = traineeMinNextDate.get(tid) ?? '';
              if (minDate !== '' && day.date <= minDate) continue;

              // Collect valid candidates for this day
              const soloCandidates: { sessionStart: number; sessionEnd: number; concurrent: number }[] = [];

              for (const slot of day.slots) {
                const slotStart = timeToMins(slot.start);
                const slotEnd = timeToMins(slot.end);
                if (slotEnd - slotStart < tType.duration) continue;

                const step = 30;
                for (let t = slotStart; t + tType.duration <= slotEnd; t += step) {
                  const sessionStart = t;
                  const sessionEnd = t + tType.duration;

                  const trainee = trainees.find((tr) => tr.id === tid)!;
                  if (!isFreeAt(trainee, day.dayOfWeek, sessionStart, sessionEnd)) continue;

                  // C7: concurrent limit (C6 removed)
                  const concurrent = countConcurrent(day.date, sessionStart, sessionEnd);
                  if (concurrent >= maxConcurrent) continue;

                  soloCandidates.push({ sessionStart, sessionEnd, concurrent });
                }
              }

              if (soloCandidates.length === 0) continue;

              // Prefer overlap-first to minimize total wall-clock time
              soloCandidates.sort((a, b) => b.concurrent - a.concurrent || a.sessionStart - b.sessionStart);
              const best = soloCandidates[0];

              scheduledSessions.push({
                id: crypto.randomUUID(),
                date: day.date,
                startTime: minsToTime(best.sessionStart),
                endTime: minsToTime(best.sessionEnd),
                trainingTypeId: tType.id,
                trainingOrder: order,
                traineeIds: [tid],
                status: 'scheduled',
              });

              takenDates.get(tid)!.add(day.date);
              const current = traineeMinNextDate.get(tid) ?? '';
              if (day.date >= current) traineeMinNextDate.set(tid, day.date);
              bookInterval(day.date, best.sessionStart, best.sessionEnd);
              soloAssigned = true;
              break soloOuter;
            }

            if (!soloAssigned) {
              unscheduled.push({
                traineeId: tid,
                trainingTypeId: tType.id,
                order,
                reason: 'no_slot',
              });
            }
          }
        }
      }
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalSessions = scheduledSessions.length;
  const totalTraineeDays = scheduledSessions.reduce((s, sess) => s + sess.traineeIds.length, 0);
  const avgGroupSize =
    totalSessions > 0 ? Math.round((totalTraineeDays / totalSessions) * 10) / 10 : 0;

  const totalPending = trainees.reduce(
    (sum, t) => sum + t.requiredSessions.filter((s) => !s.completed).length,
    0
  );
  const scheduledCount = totalTraineeDays;
  const completionRate =
    totalPending > 0 ? Math.round(Math.min(scheduledCount / totalPending, 1) * 100) : 100;

  // C7 stat: find the highest concurrent session count across all booked intervals
  let peakConcurrent = 0;
  for (const intervals of bookedIntervals.values()) {
    for (const iv of intervals) {
      const concurrent = intervals.filter((other) => iv.start < other.end && iv.end > other.start).length;
      if (concurrent > peakConcurrent) peakConcurrent = concurrent;
    }
  }

  return {
    sessions: scheduledSessions,
    unscheduled,
    stats: { totalSessions, avgGroupSize, totalTraineeDays, completionRate, peakConcurrent },
  };
}

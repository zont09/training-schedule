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
  reason: 'no_slot' | 'config_error';
}

export interface ScheduleResult {
  sessions: ScheduledSession[];
  unscheduled: UnscheduledEntry[];
  stats: {
    totalSessions: number;
    avgGroupSize: number;
    totalTraineeDays: number;
    completionRate: number; // 0-100 as integer
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
  const bookedIntervals = new Map<string, { start: number; end: number }[]>();

  // NEW: per-trainee minimum date for next session — ensures type-order is reflected in dates
  // After scheduling a session for trainee in type order k, their next session (order k+1)
  // must be on a date strictly AFTER this one.
  const traineeMinNextDate = new Map<string, string>();
  trainees.forEach((t) => traineeMinNextDate.set(t.id, ''));

  function isIntervalFree(date: string, start: number, end: number): boolean {
    const intervals = bookedIntervals.get(date) ?? [];
    return !intervals.some((iv) => start < iv.end && end > iv.start);
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
          // (ensures training type order is reflected in actual session dates per trainee)
          if (group.trainees.some((tid) => {
            const minDate = traineeMinNextDate.get(tid) ?? '';
            return minDate !== '' && day.date <= minDate;
          })) continue;

          for (const slot of day.slots) {
            const slotStart = timeToMins(slot.start);
            const slotEnd = timeToMins(slot.end);

            // C3: session must fit inside this slot
            if (slotEnd - slotStart < tType.duration) continue;

            // Iterate start times within slot in 30-min steps to find a common window
            const step = 30;
            let slotAssigned = false;
            for (let t = slotStart; t + tType.duration <= slotEnd && !slotAssigned; t += step) {
              const sessionStart = t;
              const sessionEnd = t + tType.duration;

              // C5: All trainees must be free during [sessionStart, sessionEnd]
              const allFree = group.trainees.every((tid) => {
                const trainee = trainees.find((tr) => tr.id === tid)!;
                return isFreeAt(trainee, day.dayOfWeek, sessionStart, sessionEnd);
              });

              if (!allFree) continue;

              // C6: The time interval must not overlap any existing session on this date
              if (!isIntervalFree(day.date, sessionStart, sessionEnd)) continue;

              // ✅ Assign
              scheduledSessions.push({
                id: crypto.randomUUID(),
                date: day.date,
                startTime: minsToTime(sessionStart),
                endTime: minsToTime(sessionEnd),
                trainingTypeId: tType.id,
                trainingOrder: order,
                traineeIds: [...group.trainees],
                status: 'scheduled',
              });

              group.trainees.forEach((tid) => {
                takenDates.get(tid)!.add(day.date);
                // Update min-next-date so later training types land on a later date
                const current = traineeMinNextDate.get(tid) ?? '';
                if (day.date >= current) traineeMinNextDate.set(tid, day.date);
              });
              bookInterval(day.date, sessionStart, sessionEnd);
              assigned = true;
              slotAssigned = true;
            }

            if (assigned) break outer;
          }
        }

        if (!assigned) {
          // Try to split group into solo sessions
          for (const tid of group.trainees) {
            let soloAssigned = false;

            soloOuter: for (const day of timeline) {
              if (takenDates.get(tid)?.has(day.date)) continue;

              // DATE ORDER: solo session also must be after trainee's last session date
              const minDate = traineeMinNextDate.get(tid) ?? '';
              if (minDate !== '' && day.date <= minDate) continue;

              for (const slot of day.slots) {
                const slotStart = timeToMins(slot.start);
                const slotEnd = timeToMins(slot.end);
                if (slotEnd - slotStart < tType.duration) continue;

                const step = 30;
                for (let t = slotStart; t + tType.duration <= slotEnd && !soloAssigned; t += step) {
                  const sessionStart = t;
                  const sessionEnd = t + tType.duration;

                  const trainee = trainees.find((tr) => tr.id === tid)!;
                  if (!isFreeAt(trainee, day.dayOfWeek, sessionStart, sessionEnd)) continue;

                  // C6: global time overlap check for solo sessions too
                  if (!isIntervalFree(day.date, sessionStart, sessionEnd)) continue;

                  scheduledSessions.push({
                    id: crypto.randomUUID(),
                    date: day.date,
                    startTime: minsToTime(sessionStart),
                    endTime: minsToTime(sessionEnd),
                    trainingTypeId: tType.id,
                    trainingOrder: order,
                    traineeIds: [tid],
                    status: 'scheduled',
                  });

                  takenDates.get(tid)!.add(day.date);
                  const current = traineeMinNextDate.get(tid) ?? '';
                  if (day.date >= current) traineeMinNextDate.set(tid, day.date);
                  bookInterval(day.date, sessionStart, sessionEnd);
                  soloAssigned = true;
                }
              }
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

  return {
    sessions: scheduledSessions,
    unscheduled,
    stats: { totalSessions, avgGroupSize, totalTraineeDays, completionRate },
  };
}

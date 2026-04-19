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

/** Total free minutes per trainee (used for sorting by scarcity) */
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
//
// PRIORITY 1: Maximize coverage — schedule as many sessions as possible
// PRIORITY 2: Optimize efficiency — merge trainees into shared sessions when free
//
// Strategy: "Individual-first + Auto-merge"
//   1. Schedule each trainee on their EARLIEST available day (ensures no slot wasted)
//   2. Before creating a new session, try to merge into an existing one
//      (same type, same order, same time, room < 4)
//   This naturally groups trainees who share the same free slots without
//   penalizing trainees who have unique availability (e.g. only free on Saturday).

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
      stats: { totalSessions: 0, avgGroupSize: 0, totalTraineeDays: 0, completionRate: 0, peakConcurrent: 0 },
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

  // Tier-based date bounds to respect global TrainingType.order
  // AND type-based bounds to respect RequiredSession.order.
  const traineeTierMinDate = new Map<string, string>();
  trainees.forEach((t) => traineeTierMinDate.set(t.id, ''));

  const traineeTypeMinDate = new Map<string, Map<string, string>>();
  trainees.forEach((t) => traineeTypeMinDate.set(t.id, new Map()));

  const traineeCurrentTierMaxDate = new Map<string, string>();

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

  // ── Process by TrainingType.order tiers ──────────────────────────────────────
  // Tiers group TrainingTypes that have the same order, so they can be scheduled independently
  const sortedTiers = Array.from(new Set(trainingTypes.map((t) => t.order))).sort((a, b) => a - b);

  for (const tierOrder of sortedTiers) {
    const typesInTier = trainingTypes.filter((t) => t.order === tierOrder);

    // Track the max date scheduled in this tier to become the min date for the next tier
    trainees.forEach((t) => traineeCurrentTierMaxDate.set(t.id, traineeTierMinDate.get(t.id) ?? ''));

    let tierCompleted = false;
    const scheduledInThisTier = new Set<string>(); // "traineeId|typeId|order" — successfully placed
    const failedInThisTier = new Set<string>();     // permanently unschedulable (no progress possible)

    while (!tierCompleted) {
      tierCompleted = true;
      const pendingUnits = new Map<string, string[]>(); // key: "typeId|reqOrder"

      for (const trainee of trainees) {
        for (const tType of typesInTier) {
          const relevant = trainee.requiredSessions
            .filter((s) => s.trainingTypeId === tType.id)
            .sort((a, b) => a.order - b.order);

          const next = relevant.find(
            (s) =>
              !s.completed &&
              !scheduledInThisTier.has(`${trainee.id}|${tType.id}|${s.order}`) &&
              !failedInThisTier.has(`${trainee.id}|${tType.id}|${s.order}`)
          );
          if (!next) continue;

          // Ensure all previous orders of THIS training type are scheduled/completed
          const prevDone = relevant
            .filter((s) => s.order < next.order)
            .every((s) => s.completed || scheduledInThisTier.has(`${trainee.id}|${tType.id}|${s.order}`));
          if (!prevDone) continue;

          const key = `${tType.id}|${next.order}`;
          const list = pendingUnits.get(key) ?? [];
          list.push(trainee.id);
          pendingUnits.set(key, list);
          tierCompleted = false; // found something to schedule
        }
      }

      if (tierCompleted) break;

      // ── INDIVIDUAL-FIRST SCHEDULING with automatic merging ──────────────────
      // Build flat list of individual (trainee, type, order) needs
      const individualNeeds: { traineeId: string; trainingTypeId: string; order: number }[] = [];
      for (const [key, ids] of pendingUnits.entries()) {
        const [typeId, orderStr] = key.split('|');
        const order = parseInt(orderStr, 10);
        for (const tid of ids) {
          individualNeeds.push({ traineeId: tid, trainingTypeId: typeId, order });
        }
      }

      // Sort by scarcity: trainees with FEWEST free slots first (hardest to schedule → highest priority)
      individualNeeds.sort((a, b) => {
        const ta = trainees.find((t) => t.id === a.traineeId)!;
        const tb = trainees.find((t) => t.id === b.traineeId)!;
        return totalFreeMinutes(ta) - totalFreeMinutes(tb);
      });

      let anyAssignedThisPass = false;
      const failedThisPass = new Set<string>();

      for (const need of individualNeeds) {
        const tType = trainingTypes.find((t) => t.id === need.trainingTypeId)!;
        const tid = need.traineeId;
        const trainee = trainees.find((t) => t.id === tid)!;
        let assigned = false;

        // Step 1: Try to MERGE into an existing session (same type, same order, room available)
        for (const existing of scheduledSessions) {
          if (
            existing.trainingTypeId !== tType.id ||
            existing.trainingOrder !== need.order ||
            existing.traineeIds.length >= 4
          ) continue;

          const exDate = existing.date;
          const exDay = timeline.find((d) => d.date === exDate);
          if (!exDay) continue;
          if (takenDates.get(tid)?.has(exDate)) continue;
          const minTier = traineeTierMinDate.get(tid) ?? '';
          if (minTier !== '' && exDate < minTier) continue;
          const minType = traineeTypeMinDate.get(tid)?.get(tType.id) ?? '';
          if (minType !== '' && exDate <= minType) continue;

          const exStart = timeToMins(existing.startTime);
          const exEnd = timeToMins(existing.endTime);
          if (isFreeAt(trainee, exDay.dayOfWeek, exStart, exEnd)) {
            existing.traineeIds.push(tid);
            takenDates.get(tid)!.add(exDate);
            traineeTypeMinDate.get(tid)!.set(tType.id, exDate);
            scheduledInThisTier.add(`${tid}|${tType.id}|${need.order}`);
            const currMax = traineeCurrentTierMaxDate.get(tid) ?? '';
            if (exDate > currMax) traineeCurrentTierMaxDate.set(tid, exDate);
            assigned = true;
            anyAssignedThisPass = true;
            break;
          }
        }

        if (assigned) continue;

        // Step 2: Find EARLIEST available slot for this individual trainee
        for (const day of timeline) {
          if (takenDates.get(tid)?.has(day.date)) continue;
          const minTier = traineeTierMinDate.get(tid) ?? '';
          if (minTier !== '' && day.date < minTier) continue;
          const minType = traineeTypeMinDate.get(tid)?.get(tType.id) ?? '';
          if (minType !== '' && day.date <= minType) continue;

          const candidates: { sessionStart: number; sessionEnd: number; concurrent: number }[] = [];

          for (const slot of day.slots) {
            const slotStart = timeToMins(slot.start);
            const slotEnd = timeToMins(slot.end);
            if (slotEnd - slotStart < tType.duration) continue;

            const step = 30;
            for (let t = slotStart; t + tType.duration <= slotEnd; t += step) {
              const sessionStart = t;
              const sessionEnd = t + tType.duration;

              if (!isFreeAt(trainee, day.dayOfWeek, sessionStart, sessionEnd)) continue;

              const concurrent = countConcurrent(day.date, sessionStart, sessionEnd);
              if (concurrent >= maxConcurrent) continue;

              candidates.push({ sessionStart, sessionEnd, concurrent });
            }
          }

          if (candidates.length === 0) continue;

          // Prefer earlier start time (Total Time optimization), then less concurrent
          candidates.sort((a, b) => a.sessionStart - b.sessionStart || a.concurrent - b.concurrent);
          const best = candidates[0];

          scheduledSessions.push({
            id: crypto.randomUUID(),
            date: day.date,
            startTime: minsToTime(best.sessionStart),
            endTime: minsToTime(best.sessionEnd),
            trainingTypeId: tType.id,
            trainingOrder: need.order,
            traineeIds: [tid],
            status: 'scheduled',
          });

          takenDates.get(tid)!.add(day.date);
          traineeTypeMinDate.get(tid)!.set(tType.id, day.date);
          scheduledInThisTier.add(`${tid}|${tType.id}|${need.order}`);

          const currMax = traineeCurrentTierMaxDate.get(tid) ?? '';
          if (day.date > currMax) {
            traineeCurrentTierMaxDate.set(tid, day.date);
          }
          bookInterval(day.date, best.sessionStart, best.sessionEnd);
          assigned = true;
          anyAssignedThisPass = true;
          break; // found slot, move to next need
        }

        if (!assigned) {
          failedThisPass.add(`${tid}|${tType.id}|${need.order}`);
        }
      }

      // If no progress was made, permanently fail and stop
      if (!anyAssignedThisPass) {
        for (const key of failedThisPass) {
          const parts = key.split('|');
          const traineeId = parts[0];
          const typeId = parts[1];
          const order = parseInt(parts[2], 10);
          unscheduled.push({ traineeId, trainingTypeId: typeId, order, reason: 'no_slot' });
          failedInThisTier.add(key);
        }
        break;
      }
      // Progress was made → failed trainees will be retried next iteration
    }

    // Advance tier min date for next tiers
    trainees.forEach((t) => {
      traineeTierMinDate.set(t.id, traineeCurrentTierMaxDate.get(t.id) ?? '');
    });
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

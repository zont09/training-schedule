import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface TrainingType {
  id: string;
  name: string;
  duration: number; // minutes
  order: number; // precedence (1 = earliest)
  color?: string; // hex code format
}

export interface RequiredSession {
  trainingTypeId: string;
  order: number;
  completed: boolean;
  completedDate?: string; // YYYY-MM-DD
}

export interface FreeSlot {
  id: string; // To allow unique targeting
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Mon, 7=Sun
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface Trainee {
  id: string;
  name: string;
  requiredSessions: RequiredSession[];
  freeSlots: FreeSlot[];
}

export interface DayConfig {
  dayOfWeek: number;
  slots: { start: string; end: string }[];
  enabled: boolean;
}

export interface WeekConfig {
  id: string;
  name: string;
  days: DayConfig[];
  maxConcurrentSessions: number; // C7: max sessions running at the same time (≥ 1)
}

export interface ScheduledSession {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  trainingTypeId: string;
  trainingOrder: number;
  traineeIds: string[];
  status: "scheduled" | "completed" | "cancelled";
}

interface ScheduleState {
  trainingTypes: TrainingType[];
  trainees: Trainee[];
  weekConfigs: WeekConfig[];
  scheduledSessions: ScheduledSession[];

  // Actions
  addTrainingType: (type: TrainingType) => void;
  updateTrainingType: (id: string, type: Partial<TrainingType>) => void;
  deleteTrainingType: (id: string) => void;
  setTrainingTypes: (types: TrainingType[]) => void;

  addTrainee: (trainee: Trainee) => void;
  updateTrainee: (id: string, trainee: Partial<Trainee>) => void;
  deleteTrainee: (id: string) => void;

  addWeekConfig: (config: WeekConfig) => void;
  updateWeekConfig: (id: string, config: Partial<WeekConfig>) => void;
  deleteWeekConfig: (id: string) => void;

  setScheduledSessions: (sessions: ScheduledSession[]) => void;
  
  importData: (data: Partial<Pick<ScheduleState, 'trainingTypes' | 'trainees' | 'weekConfigs' | 'scheduledSessions'>>) => void;
}

const defaultWeekConfig: WeekConfig = {
  id: 'default',
  name: 'Tuần mặc định',
  maxConcurrentSessions: 3,
  days: [
    { dayOfWeek: 1, enabled: true, slots: [{ start: "09:00", end: "21:00" }] },
    { dayOfWeek: 2, enabled: true, slots: [{ start: "09:00", end: "21:00" }] },
    { dayOfWeek: 3, enabled: true, slots: [{ start: "09:00", end: "21:00" }] },
    { dayOfWeek: 4, enabled: true, slots: [{ start: "09:00", end: "21:00" }] },
    { dayOfWeek: 5, enabled: true, slots: [{ start: "09:00", end: "21:00" }] },
    { dayOfWeek: 6, enabled: true, slots: [{ start: "09:00", end: "11:00" }, { start: "19:00", end: "21:00" }] },
    { dayOfWeek: 7, enabled: true, slots: [{ start: "19:00", end: "21:00" }] },
  ]
};

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set) => ({
      trainingTypes: [],
      trainees: [],
      weekConfigs: [defaultWeekConfig],
      scheduledSessions: [],

      addTrainingType: (type) => set((state) => ({ trainingTypes: [...state.trainingTypes, type] })),
      updateTrainingType: (id, partial) => set((state) => ({
        trainingTypes: state.trainingTypes.map((t) => t.id === id ? { ...t, ...partial } : t)
      })),
      deleteTrainingType: (id) => set((state) => ({
        trainingTypes: state.trainingTypes.filter((t) => t.id !== id)
      })),
      setTrainingTypes: (types) => set({ trainingTypes: types }),

      addTrainee: (trainee) => set((state) => ({ trainees: [...state.trainees, trainee] })),
      updateTrainee: (id, partial) => set((state) => ({
        trainees: state.trainees.map((t) => t.id === id ? { ...t, ...partial } : t)
      })),
      deleteTrainee: (id) => set((state) => ({
        trainees: state.trainees.filter((t) => t.id !== id)
      })),

      addWeekConfig: (config) => set((state) => ({ weekConfigs: [...state.weekConfigs, config] })),
      updateWeekConfig: (id, partial) => set((state) => ({
        weekConfigs: state.weekConfigs.map((w) => w.id === id ? { ...w, ...partial } : w)
      })),
      deleteWeekConfig: (id) => set((state) => ({
        weekConfigs: state.weekConfigs.filter((w) => w.id !== id)
      })),

      setScheduledSessions: (sessions) => set({ scheduledSessions: sessions }),
      
      importData: (data) => set((state) => ({
        ...state,
        ...data,
      })),
    }),
    {
      name: 'tsa_storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

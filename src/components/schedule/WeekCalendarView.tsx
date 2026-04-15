import { useMemo, useState, useEffect } from 'react';
import { useScheduleStore, ScheduledSession } from '@/store/useScheduleStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, ChevronLeft, ChevronRight, Users, Clock, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_MINS = (END_HOUR - START_HOUR) * 60;
const DEFAULT_MIN_H = 1;    // px per minute
const MIN_MIN_H = 0.5;
const MAX_MIN_H = 4;

// Compute grid subdivision interval in minutes based on px/min density
function getGridInterval(minuteHeight: number): number {
  if (minuteHeight >= 2.5) return 15;
  if (minuteHeight >= 1.2) return 30;
  return 60;
}

function getTimeOffset(time: string) {
  const [h, m] = time.split(':').map(Number);
  return (h - START_HOUR) * 60 + m;
}

function getDurationHeight(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function formatDisplay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function WeekCalendarView({ startDate }: { startDate?: Date }) {
  const { scheduledSessions, trainingTypes, trainees } = useScheduleStore();
  const [weekStart, setWeekStart] = useState(() => getMonday(startDate || new Date()));
  const [selectedSession, setSelectedSession] = useState<ScheduledSession | null>(null);
  const [minuteHeight, setMinuteHeight] = useState(DEFAULT_MIN_H);

  const zoomIn = () => setMinuteHeight((v) => Math.min(parseFloat((v + 0.25).toFixed(2)), MAX_MIN_H));
  const zoomOut = () => setMinuteHeight((v) => Math.max(parseFloat((v - 0.25).toFixed(2)), MIN_MIN_H));

  // Touchpad / Ctrl+Wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setMinuteHeight((v) => Math.min(MAX_MIN_H, Math.max(MIN_MIN_H, parseFloat((v + delta).toFixed(2)))));
    }
  };

  const gridInterval = getGridInterval(minuteHeight);
  const totalHeight = TOTAL_MINS * minuteHeight;

  // Build list of grid tick marks (multiples of gridInterval from START_HOUR)
  const gridTicks = useMemo(() => {
    const ticks: { mins: number; label: string; isMajor: boolean }[] = [];
    for (let m = 0; m <= TOTAL_MINS; m += gridInterval) {
      const absMin = START_HOUR * 60 + m;
      const h = Math.floor(absMin / 60);
      const min = absMin % 60;
      ticks.push({
        mins: m,
        label: `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`,
        isMajor: min === 0,
      });
    }
    return ticks;
  }, [gridInterval]);

  useEffect(() => {
    if (startDate) {
      setWeekStart(getMonday(startDate));
    }
  }, [startDate]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const sessionsThisWeek = useMemo(() => {
    const dates = new Set(weekDates.map(formatDate));
    return scheduledSessions.filter((s) => dates.has(s.date));
  }, [scheduledSessions, weekDates]);


  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => setWeekStart(getMonday(new Date()));

  const weekLabel = () => {
    const start = weekDates[0];
    const end = weekDates[6];
    return `${start.getDate()}/${start.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`;
  };

  if (scheduledSessions.length === 0) {
    return (
      <Card className="mt-6 border-border h-[500px] flex flex-col">
        <CardContent className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <CalendarDays className="w-8 h-8 opacity-50" />
          </div>
          <p className="text-lg font-medium">Chưa có lịch nào được xếp.</p>
          <p className="text-sm">
            Nhấn <strong>Xếp Lịch Tự Động</strong> ở trên để hệ thống tính toán lịch.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4 border-border flex flex-col">
      {/* Week nav */}
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Lịch Tuần</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevWeek}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center">{weekLabel()}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextWeek}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>
              Hôm nay
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomOut} disabled={minuteHeight <= MIN_MIN_H} title="Thu nhỏ">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[36px] text-center">{Math.round(minuteHeight / DEFAULT_MIN_H * 100)}%</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={zoomIn} disabled={minuteHeight >= MAX_MIN_H} title="Phóng to">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-hidden flex flex-col">
        {/* Header Grid */}
        <div className="flex border-b border-border bg-muted/20">
          <div className="w-16 flex-shrink-0 border-r border-border" />
          <div className="flex-1 grid grid-cols-7">
            {weekDates.map((d, i) => {
              const isToday = formatDate(d) === formatDate(new Date());
              return (
                <div
                  key={i}
                  className={`py-3 flex flex-col items-center justify-center text-xs font-semibold border-r border-border last:border-r-0 ${
                    isToday ? 'text-primary bg-primary/5' : 'text-muted-foreground'
                  }`}
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div
                    className={`text-lg font-bold mt-1 ${
                      isToday
                        ? 'bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center'
                        : ''
                    }`}
                  >
                    {d.getDate()}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{formatDisplay(formatDate(d))}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Time Grid */}
        <div className="overflow-y-auto" style={{ maxHeight: '640px' }} onWheel={handleWheel}>
          <div className="flex relative" style={{ height: totalHeight }}>
            <div className="w-16 flex-shrink-0 border-r border-border bg-background relative">
              {gridTicks.map(({ mins, label, isMajor }) => {
                if (mins >= TOTAL_MINS) return null;
                return (
                  <div
                    key={mins}
                    style={{ top: mins * minuteHeight }}
                    className="absolute w-full"
                  >
                    <span
                      className={`absolute -top-2.5 right-2 bg-background px-1 ${
                        isMajor
                          ? 'text-xs font-medium text-muted-foreground/70'
                          : 'text-[10px] text-muted-foreground/40'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Timetable Grid */}
            <div className="flex-1 relative bg-background">
              {/* Horizontal grid lines */}
              {gridTicks.map(({ mins, isMajor }) => (
                <div
                  key={`hl-${mins}`}
                  className={`absolute w-full pointer-events-none border-t ${
                    isMajor ? 'border-border/50' : 'border-border/20'
                  }`}
                  style={{ top: mins * minuteHeight }}
                />
              ))}

              {/* Day column separators */}
              <div className="absolute inset-0 grid grid-cols-7 divide-x divide-border pointer-events-none" />

              {/* Absolute positioned events */}
              <div className="absolute inset-0 grid grid-cols-7">
                {weekDates.map((d, di) => {
                  const dateStr = formatDate(d);
                  const daySessions = sessionsThisWeek.filter((s) => s.date === dateStr);

                  return (
                    <div key={`d-${di}`} className="relative w-full h-full">
                      {daySessions.map((sess) => {
                        const tType = trainingTypes.find((t) => t.id === sess.trainingTypeId);
                        const color = tType?.color ?? '#7C3AED';
                        const count = sess.traineeIds.length;
                        const names = sess.traineeIds
                          .map((id) => trainees.find((t) => t.id === id)?.name ?? '?')
                          .join(', ');

                        const top = getTimeOffset(sess.startTime) * minuteHeight;
                        const height = getDurationHeight(sess.startTime, sess.endTime) * minuteHeight;

                        // Don't render if it's completely out of the [START_HOUR, END_HOUR] bounds
                        // But scheduler enforces WeekConfig which defaults to 09:00 - 21:00 so it's safe.

                        return (
                          <div
                            key={sess.id}
                            className="absolute left-1 right-1 rounded-sm p-1.5 text-[11px] leading-tight cursor-pointer hover:opacity-90 overflow-hidden group shadow-sm transition-all"
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                              backgroundColor: `${color}20`, // slightly opaque background
                              borderLeft: `4px solid ${color}`,
                              color: 'var(--foreground)',
                              zIndex: 10,
                            }}
                            title={names}
                            onClick={() => setSelectedSession(sess)}
                          >
                            <div className="font-semibold block truncate" style={{ color }}>
                              {tType?.name ?? 'Unknown'} <span className="opacity-70 font-normal ml-1">Ca {sess.trainingOrder}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground group-hover:text-foreground/80 opacity-90 transition-colors">
                              <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {sess.startTime} - {sess.endTime}</span>
                              <span className="flex items-center gap-0.5"><Users className="w-3 h-3 ml-1" /> {count}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      <Dialog open={!!selectedSession} onOpenChange={(v) => !v && setSelectedSession(null)}>
        <DialogContent className="sm:max-w-[425px]">
          {selectedSession && (() => {
            const tType = trainingTypes.find((t) => t.id === selectedSession.trainingTypeId);
            const color = tType?.color ?? '#7C3AED';
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl" style={{ color }}>
                    {tType?.name ?? 'Unknown Training'}
                    <Badge variant="outline" style={{ borderColor: color, color }}>Ca {selectedSession.trainingOrder}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-3 text-sm">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <span>{formatDisplay(selectedSession.date)} ({DAY_LABELS[new Date(selectedSession.date).getDay() === 0 ? 6 : new Date(selectedSession.date).getDay() - 1]})</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedSession.startTime} – {selectedSession.endTime}</span>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="space-y-1 w-full">
                      <span className="font-medium">Danh sách {selectedSession.traineeIds.length} học viên tham gia:</span>
                      <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                        {selectedSession.traineeIds.map((id) => (
                          <li key={id}>{trainees.find((t) => t.id === id)?.name ?? '?'}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

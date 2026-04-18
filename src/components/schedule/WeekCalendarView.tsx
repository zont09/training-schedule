import { useMemo, useState, useEffect } from 'react';
import { useScheduleStore, ScheduledSession } from '@/store/useScheduleStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, ChevronLeft, ChevronRight, Users, Clock, ZoomIn, ZoomOut, Filter, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  // Use local date components to avoid UTC offset shifting the date (e.g. UTC+7 timezone)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatDisplay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// Logic to layout overlapping sessions
function getSessionLayout(sessions: ScheduledSession[]) {
  const sorted = [...sessions].sort((a, b) => getTimeOffset(a.startTime) - getTimeOffset(b.startTime));
  const clusters: ScheduledSession[][] = [];
  let currentCluster: ScheduledSession[] = [];
  let clusterEnd = -1;

  sorted.forEach(sess => {
    const start = getTimeOffset(sess.startTime);
    const end = getTimeOffset(sess.endTime);
    if (start >= clusterEnd && currentCluster.length > 0) {
      clusters.push(currentCluster);
      currentCluster = [];
      clusterEnd = -1;
    }
    currentCluster.push(sess);
    clusterEnd = Math.max(clusterEnd, end);
  });
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const layout = new Map<string, { col: number, maxCols: number }>();

  clusters.forEach(cluster => {
    const columns: ScheduledSession[][] = [];
    cluster.forEach(sess => {
      let placed = false;
      for (let i = 0; i < columns.length; i++) {
        const lastSession = columns[i][columns[i].length - 1];
        if (getTimeOffset(lastSession.endTime) <= getTimeOffset(sess.startTime)) {
          columns[i].push(sess);
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([sess]);
      }
    });

    cluster.forEach(sess => {
      const colIndex = columns.findIndex(col => col.some(s => s.id === sess.id));
      layout.set(sess.id, { col: colIndex, maxCols: columns.length });
    });
  });

  return layout;
}

export default function WeekCalendarView({ startDate }: { startDate?: Date }) {
  const { scheduledSessions, trainingTypes, trainees } = useScheduleStore();
  const [weekStart, setWeekStart] = useState(() => getMonday(startDate || new Date()));
  const [selectedSession, setSelectedSession] = useState<ScheduledSession | null>(null);
  const [minuteHeight, setMinuteHeight] = useState(DEFAULT_MIN_H);

  // Filters
  const [selectedTrainees, setSelectedTrainees] = useState<string[]>([]);
  const [selectedTrainingTypes, setSelectedTrainingTypes] = useState<string[]>([]);

  // Vertical Zoom
  const zoomIn = () => setMinuteHeight((v) => Math.min(parseFloat((v + 0.25).toFixed(2)), MAX_MIN_H));
  const zoomOut = () => setMinuteHeight((v) => Math.max(parseFloat((v - 0.25).toFixed(2)), MIN_MIN_H));

  // Horizontal Zoom
  const MAX_DAY_W = 400;
  const [dayWidth, setDayWidth] = useState(0); // 0 = flex-1 (auto)
  const zoomInH = () => setDayWidth(w => w === 0 ? 150 : Math.min(w + 50, MAX_DAY_W));
  const zoomOutH = () => setDayWidth(w => w <= 150 ? 0 : w - 50);

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
    return scheduledSessions.filter((s) => {
      if (!dates.has(s.date)) return false;
      if (selectedTrainingTypes.length > 0 && !selectedTrainingTypes.includes(s.trainingTypeId)) return false;
      if (selectedTrainees.length > 0 && !s.traineeIds.some(id => selectedTrainees.includes(id))) return false;
      return true;
    });
  }, [scheduledSessions, weekDates, selectedTrainees, selectedTrainingTypes]);


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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-base font-semibold">Lịch Tuần</CardTitle>
            
            {/* Tương tác bộ lọc */}
            <div className="flex items-center gap-2">
              {/* Lọc: Loại Training */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-dashed text-xs font-normal">
                    <Filter className="mr-2 h-3 w-3" />
                    Loại Training
                    {selectedTrainingTypes.length > 0 && (
                      <Badge variant="secondary" className="ml-2 px-1 py-0.5 text-[10px]">
                        {selectedTrainingTypes.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <div className="p-2 border-b">
                    <span className="text-xs font-medium text-muted-foreground">Lọc theo Ca Training</span>
                  </div>
                  <ScrollArea className="h-48">
                    <div className="p-2 space-y-1">
                      {trainingTypes.map((t) => (
                        <div key={t.id} className="flex items-center space-x-2 rounded-sm px-2 py-1.5 hover:bg-muted/50">
                          <Checkbox 
                            id={`ft-${t.id}`} 
                            checked={selectedTrainingTypes.includes(t.id)}
                            onCheckedChange={(checked) => {
                              setSelectedTrainingTypes(prev => 
                                checked 
                                  ? [...prev, t.id] 
                                  : prev.filter(v => v !== t.id)
                              );
                            }}
                          />
                          <label htmlFor={`ft-${t.id}`} className="text-sm cursor-pointer flex-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color || '#7C3AED' }}/>
                            {t.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  {selectedTrainingTypes.length > 0 && (
                    <div className="p-2 border-t">
                      <Button variant="ghost" size="sm" className="w-full h-8 text-xs justify-center" onClick={() => setSelectedTrainingTypes([])}>
                        Xoá lọc
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* Lọc: Học Viên */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-dashed text-xs font-normal">
                    <Users className="mr-2 h-3 w-3" />
                    Học Viên
                    {selectedTrainees.length > 0 && (
                      <Badge variant="secondary" className="ml-2 px-1 py-0.5 text-[10px]">
                        {selectedTrainees.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <div className="p-2 border-b">
                    <span className="text-xs font-medium text-muted-foreground">Lọc theo Học Viên</span>
                  </div>
                  <ScrollArea className="h-48">
                    <div className="p-2 space-y-1">
                      {trainees.map((t) => (
                        <div key={t.id} className="flex items-center space-x-2 rounded-sm px-2 py-1.5 hover:bg-muted/50">
                          <Checkbox 
                            id={`fs-${t.id}`} 
                            checked={selectedTrainees.includes(t.id)}
                            onCheckedChange={(checked) => {
                              setSelectedTrainees(prev => 
                                checked 
                                  ? [...prev, t.id] 
                                  : prev.filter(v => v !== t.id)
                              );
                            }}
                          />
                          <label htmlFor={`fs-${t.id}`} className="text-sm cursor-pointer flex-1 line-clamp-1">{t.name}</label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  {selectedTrainees.length > 0 && (
                    <div className="p-2 border-t">
                      <Button variant="ghost" size="sm" className="w-full h-8 text-xs justify-center" onClick={() => setSelectedTrainees([])}>
                        Xoá lọc
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

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
            
            <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-md border text-xs h-8">
              <span className="px-1.5 text-muted-foreground font-medium">Ngang</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 rounded-[4px]" onClick={zoomOutH} disabled={dayWidth === 0}>-</Button>
              <span className="w-8 text-center">{dayWidth === 0 ? 'Auto' : `${dayWidth}px`}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 rounded-[4px]" onClick={zoomInH} disabled={dayWidth >= MAX_DAY_W}>+</Button>
            </div>
            
            <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-md border text-xs h-8">
              <span className="px-1.5 text-muted-foreground font-medium">Dọc</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 rounded-[4px]" onClick={zoomOut} disabled={minuteHeight <= MIN_MIN_H}>-</Button>
              <span className="w-9 text-center">{Math.round(minuteHeight / DEFAULT_MIN_H * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 rounded-[4px]" onClick={zoomIn} disabled={minuteHeight >= MAX_MIN_H}>+</Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-hidden flex flex-col relative w-full">
        {/* Scrollable Container for both Axes */}
        <div className="flex-1 overflow-auto flex flex-col relative" style={{ maxHeight: '640px' }} onWheel={handleWheel}>
          <div className="min-w-fit flex flex-col" style={{ width: dayWidth ? `${dayWidth * 7 + 64}px` : '100%' }}>
            
            {/* Header Grid */}
            <div className="flex border-b border-border bg-background sticky top-0 z-30 shadow-sm">
              <div className="w-16 flex-shrink-0 border-r border-border bg-background sticky left-0 z-40" />
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
            <div className="flex relative" style={{ height: totalHeight }}>
              {/* Y Axis / Time Column */}
              <div className="w-16 flex-shrink-0 border-r border-border bg-background sticky left-0 z-20 shadow-[1px_0_2px_rgba(0,0,0,0.05)]">
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

              {/* Timetable Body Grid */}
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
                  const layout = getSessionLayout(daySessions);

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

                        // Layout calculations
                        const { col, maxCols } = layout.get(sess.id) ?? { col: 0, maxCols: 1 };
                        const width = maxCols > 1 ? `calc(${100 / maxCols}% - 2px)` : 'calc(100% - 8px)';
                        const left = maxCols > 1 ? `calc(${(100 / maxCols) * col}% + 1px)` : '4px';

                        return (
                          <div
                            key={sess.id}
                            className={`absolute rounded-sm p-1.5 text-[11px] leading-tight cursor-pointer hover:opacity-90 overflow-hidden group shadow-sm transition-all ${maxCols > 1 ? 'border border-background' : ''}`}
                            style={{
                              left,
                              width,
                              top: `${top}px`,
                              height: `${height}px`,
                              backgroundColor: `${color}20`, // slightly opaque background
                              borderLeft: `4px solid ${color}`,
                              color: 'var(--foreground)',
                              zIndex: 10 + col,
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

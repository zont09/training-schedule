import { useState } from 'react';
import { useScheduleStore } from '@/store/useScheduleStore';
import { runScheduler, ScheduleResult } from '@/lib/scheduler';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import WeekCalendarView from '@/components/schedule/WeekCalendarView';
import {
  Wand2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Users,
  CalendarDays,
  Layers,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfWeek, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

export default function SchedulePage() {
  const { trainees, trainingTypes, weekConfigs, scheduledSessions, setScheduledSessions } =
    useScheduleStore();

  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Move to next Monday
    const day = d.getDay();
    const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(d.getDate() + diff);
    return startOfWeek(d, { weekStartsOn: 1 });
  });

  const [maxWeeks, setMaxWeeks] = useState<number | string>(8);
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = () => {
    if (trainees.length === 0 || trainingTypes.length === 0) return;
    setRunning(true);

    setTimeout(() => {
      const res = runScheduler(
        trainees,
        trainingTypes,
        weekConfigs,
        startDate,
        Number(maxWeeks) || 8
      );
      setScheduledSessions(res.sessions);
      setResult(res);
      setRunning(false);
    }, 100); // allow UI to show spinner
  };

  const handleClear = () => {
    setScheduledSessions([]);
    setResult(null);
  };

  const isReady = trainees.length > 0 && trainingTypes.length > 0 && weekConfigs.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Lịch Training</h2>
          <p className="text-muted-foreground mt-1">
            Tự động xếp lịch dựa trên yêu cầu, giờ rảnh và cấu hình tuần.
          </p>
        </div>

        {scheduledSessions.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClear} className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10">
            <RotateCcw className="w-4 h-4" /> Xoá Lịch Hiện Tại
          </Button>
        )}
      </div>

      {/* Config panel */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-accent" />
            Cấu Hình & Chạy Thuật Toán
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 items-end">
            <div className="space-y-2">
              <Label>Tuần bắt đầu xếp lịch</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-[260px] justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {startDate ? (
                      `Tuần: ${format(startDate, 'dd/MM')} – ${format(addDays(startDate, 6), 'dd/MM/yyyy')}`
                    ) : (
                      <span>Chọn tuần</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      if (date) {
                        setStartDate(startOfWeek(date, { weekStartsOn: 1 }));
                      }
                    }}
                    initialFocus
                    modifiers={{
                      selectedWeek: (date) => {
                        if (!startDate) return false;
                        const end = addDays(startDate, 6);
                        return date >= startDate && date <= end;
                      }
                    }}
                    modifiersStyles={{
                      selectedWeek: {
                        backgroundColor: "var(--primary)",
                        color: "var(--primary-foreground)",
                        borderRadius: "0",
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Số tuần tối đa</Label>
              <Input
                type="number"
                min={1}
                max={26}
                value={maxWeeks}
                onChange={(e) => setMaxWeeks(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-28"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {trainees.length} học viên
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {trainingTypes.length} loại training
                </span>
              </div>
              <Button
                onClick={handleRun}
                disabled={!isReady || running}
                className="flex gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                <Wand2 className="w-4 h-4" />
                {running ? 'Đang tính toán…' : 'Xếp Lịch Tự Động'}
              </Button>
              {!isReady && (
                <p className="text-xs text-destructive">
                  Cần có học viên, loại training và cấu hình tuần.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats row (shown after run) */}
      {result && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            icon={<CalendarDays className="w-5 h-5 text-primary" />}
            label="Tổng Ca Đã Xếp"
            value={result.stats.totalSessions}
            bg="bg-primary/5"
          />
          <StatCard
            icon={<Users className="w-5 h-5 text-accent" />}
            label="Trung Bình HV/Ca"
            value={result.stats.avgGroupSize}
            bg="bg-accent/5"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
            label="Tỷ Lệ Hoàn Thành"
            value={`${result.stats.completionRate}%`}
            bg="bg-emerald-50"
          />
          <StatCard
            icon={<Zap className="w-5 h-5 text-amber-500" />}
            label="Đỉnh Ca Đồng Thời"
            value={result.stats.peakConcurrent}
            bg="bg-amber-50"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
            label="Không Xếp Được"
            value={result.unscheduled.length}
            bg="bg-destructive/5"
          />
        </div>
      )}

      {/* Unscheduled warnings */}
      {result && result.unscheduled.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Không tìm được slot cho {result.unscheduled.length} ca — Cần kiểm tra lại giờ rảnh hoặc cấu hình tuần
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {result.unscheduled.map((u, i) => {
                const trainee = trainees.find((t) => t.id === u.traineeId);
                const tType = trainingTypes.find((t) => t.id === u.trainingTypeId);
                return (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="w-3 h-3 text-destructive flex-shrink-0" />
                    <span>
                      <strong>{trainee?.name ?? u.traineeId}</strong> — {tType?.name ?? u.trainingTypeId} Ca {u.order}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                      {u.reason === 'no_slot'
                        ? 'Không có slot khả dụng'
                        : u.reason === 'concurrent_limit'
                        ? 'Vượt giới hạn ca đồng thời'
                        : 'Lỗi cấu hình'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success banner */}
      {result && result.unscheduled.length === 0 && result.sessions.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Xếp lịch thành công toàn bộ {result.stats.totalSessions} ca training!
        </div>
      )}

      {/* Calendar */}
      <WeekCalendarView startDate={startDate} />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bg: string;
}) {
  return (
    <Card className={`border-border ${bg}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="flex-shrink-0">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

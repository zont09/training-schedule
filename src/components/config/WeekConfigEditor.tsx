import { useScheduleStore } from '@/store/useScheduleStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';



export default function WeekConfigEditor() {
  const { weekConfigs, updateWeekConfig } = useScheduleStore();
  const config = weekConfigs[0]; // Currently only handling default week config

  const handleToggleDay = (dayIndex: number) => {
    const newDays = config.days.map((d, i) => 
      i === dayIndex ? { ...d, enabled: !d.enabled } : d
    );
    updateWeekConfig(config.id, { days: newDays });
  };

  const handleAddSlot = (dayIndex: number) => {
    const newDays = config.days.map((d, i) => 
      i === dayIndex ? { ...d, slots: [...d.slots, { start: '09:00', end: '11:00' }] } : d
    );
    updateWeekConfig(config.id, { days: newDays });
  };

  const handleUpdateSlot = (dayIndex: number, slotIndex: number, field: 'start'|'end', val: string) => {
    const newDays = config.days.map((d, i) => {
      if (i !== dayIndex) return d;
      const newSlots = d.slots.map((s, j) => j === slotIndex ? { ...s, [field]: val } : s);
      return { ...d, slots: newSlots };
    });
    updateWeekConfig(config.id, { days: newDays });
  };

  const handleDeleteSlot = (dayIndex: number, slotIndex: number) => {
    const newDays = config.days.map((d, i) => {
      if (i !== dayIndex) return d;
      const newSlots = d.slots.filter((_, j) => j !== slotIndex);
      return { ...d, slots: newSlots };
    });
    updateWeekConfig(config.id, { days: newDays });
  };

  if (!config) return null;

  const handleMaxConcurrentChange = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) {
      updateWeekConfig(config.id, { maxConcurrentSessions: n });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Khung Giờ Tuần: {config.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* C7: Max concurrent sessions setting */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div>
            <p className="text-sm font-medium">Số ca tối đa đồng thời</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tại một thời điểm bất kỳ, không quá x ca được diễn ra song song
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={20}
            value={config.maxConcurrentSessions ?? 3}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleMaxConcurrentChange(e.target.value)}
            className="w-20 h-9 text-center text-base font-semibold"
          />
        </div>
        {config.days.map((day, dayIndex) => {
          // day.dayOfWeek format (1=Mon, 7=Sun). Map it correctly:
          const label = day.dayOfWeek === 7 ? 'Chủ Nhật' : `Thứ ${day.dayOfWeek + 1}`;
          
          return (
            <div key={dayIndex} className={cn("flex flex-col gap-3 p-4 rounded-lg border", day.enabled ? "bg-card border-border" : "bg-muted/50 border-dashed")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={day.enabled} onChange={() => handleToggleDay(dayIndex)} className="w-4 h-4 accent-primary" />
                  <span className={cn("font-medium", !day.enabled && "text-muted-foreground line-through")}>{label}</span>
                </div>
                {day.enabled && (
                  <Button variant="outline" size="sm" onClick={() => handleAddSlot(dayIndex)} className="h-8 text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Thêm Ca
                  </Button>
                )}
              </div>
              
              {day.enabled && day.slots.length > 0 && (
                <div className="pl-7 space-y-2">
                  {day.slots.map((slot, slotIndex) => (
                    <div key={slotIndex} className="flex items-center gap-2">
                      <Input type="time" value={slot.start} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateSlot(dayIndex, slotIndex, 'start', e.target.value)} className="w-32 h-8 text-sm" />
                      <span className="text-muted-foreground">-</span>
                      <Input type="time" value={slot.end} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateSlot(dayIndex, slotIndex, 'end', e.target.value)} className="w-32 h-8 text-sm" />
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteSlot(dayIndex, slotIndex)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

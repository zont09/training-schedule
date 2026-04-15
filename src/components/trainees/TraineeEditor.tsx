import { useState, useEffect } from 'react';
import { useScheduleStore, Trainee, RequiredSession, FreeSlot } from '@/store/useScheduleStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, CheckCircle2, Circle, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// Helper for days translation
const DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

interface TraineeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainee: Trainee | null;
}

export default function TraineeEditor({ open, onOpenChange, trainee }: TraineeEditorProps) {
  const { addTrainee, updateTrainee, trainingTypes } = useScheduleStore();
  
  const [name, setName] = useState('');
  const [sessions, setSessions] = useState<RequiredSession[]>([]);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);

  useEffect(() => {
    if (trainee) {
      setName(trainee.name);
      setSessions([...trainee.requiredSessions]);
      setFreeSlots([...trainee.freeSlots]);
    } else {
      setName('');
      setSessions([]);
      setFreeSlots([]);
    }
  }, [trainee, open]);

  const handleSave = () => {
    if (!name.trim()) return;
    
    if (trainee) {
      updateTrainee(trainee.id, { name, requiredSessions: sessions, freeSlots });
    } else {
      addTrainee({
        id: crypto.randomUUID(),
        name,
        requiredSessions: sessions,
        freeSlots
      });
    }
    onOpenChange(false);
  };

  const toggleSession = (typeId: string) => {
    const isSelected = sessions.some(s => s.trainingTypeId === typeId);
    if (isSelected) {
      setSessions(sessions.filter(s => s.trainingTypeId !== typeId));
    } else {
      const tType = trainingTypes.find(t => t.id === typeId);
      if (!tType) return;
      setSessions([...sessions, {
        trainingTypeId: typeId,
        order: 1, // Only 1 per type now
        completed: false
      }]);
    }
  };

  const addFreeSlot = (day: number) => {
    setFreeSlots([...freeSlots, {
      id: crypto.randomUUID(),
      dayOfWeek: day as any,
      startTime: '09:00',
      endTime: '12:00'
    }]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[700px] max-h-[90vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{trainee ? 'Sửa Học Viên' : 'Thêm Học Viên Mới'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-6 pt-4 min-h-0">
          <div className="flex-shrink-0 space-y-2">
            <Label>Tên học viên</Label>
            <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Nhập tên học viên..." />
          </div>

          <Tabs defaultValue="sessions" className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <TabsList className="w-full flex-shrink-0 grid border border-border bg-muted/30 grid-cols-2 h-12">
              <TabsTrigger value="sessions" className="text-sm">Ca Học Bắt Buộc</TabsTrigger>
              <TabsTrigger value="slots" className="text-sm">Giờ Rảnh (Thiết Kế)</TabsTrigger>
            </TabsList>

            <TabsContent value="sessions" className="flex-1 min-h-0 overflow-hidden mt-4 data-[state=active]:flex flex-col space-y-4">
              <div className="flex-shrink-0 flex gap-2 items-end bg-card p-3 rounded-lg border border-border shadow-sm">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Loại Training</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-10 bg-background text-muted-foreground border-input">
                        Chọn loại training <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[340px] p-2 bg-popover text-popover-foreground border-border shadow-md" align="start">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground ml-2 mb-2 block">Multiselect: Tích chọn các loại training</Label>
                        {trainingTypes.map(t => {
                          const isSelected = sessions.some(s => s.trainingTypeId === t.id);
                          return (
                            <div 
                              key={t.id} 
                              className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md transition-colors cursor-pointer"
                              onClick={() => toggleSession(t.id)}
                            >
                              <Checkbox 
                                checked={isSelected} 
                                onCheckedChange={() => toggleSession(t.id)} 
                                className="pointer-events-none" 
                              />
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: t.color}}/>
                              <span className="text-sm font-medium flex-1">{t.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground py-4">Chưa có ca học nào.</p>
                ) : (
                  sessions.sort((a,b) => {
                    const dt = a.trainingTypeId.localeCompare(b.trainingTypeId);
                    return dt === 0 ? a.order - b.order : dt;
                  }).map((s, idx) => {
                    const tName = trainingTypes.find(t => t.id === s.trainingTypeId)?.name || 'Unknown';
                    const color = trainingTypes.find(t => t.id === s.trainingTypeId)?.color;
                    
                    return (
                      <div key={idx} className={cn("flex items-center justify-between p-3 rounded-md border", s.completed ? "bg-muted/50 border-muted" : "bg-card border-border")}>
                        <div className="flex items-center gap-3">
                          <button onClick={() => {
                            const newS = [...sessions];
                            newS[idx].completed = !newS[idx].completed;
                            setSessions(newS);
                          }} className={cn("transition-colors", s.completed ? "text-primary": "text-muted-foreground")}>
                            {s.completed ? <CheckCircle2 className="w-5 h-5"/> : <Circle className="w-5 h-5"/>}
                          </button>
                          <div>
                            <p className={cn("text-sm font-medium", s.completed && "line-through text-muted-foreground")}>
                              {tName} <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold" style={{backgroundColor: color ? `${color}20` : '#ccc', color: color}} >Đã chọn</span>
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setSessions(sessions.filter((_, i) => i !== idx))} className="text-destructive hover:bg-destructive/10 h-8 w-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="slots" className="flex-1 min-h-0 overflow-hidden mt-4 data-[state=active]:flex flex-col space-y-4">
              <div className="flex-shrink-0 grid grid-cols-7 gap-2">
                {[1,2,3,4,5,6,7].map(d => (
                  <Button key={d} variant="outline" onClick={() => addFreeSlot(d)} className="text-xs h-8 px-0 border-dashed hover:border-primary hover:text-primary">
                    + {DAYS[d-1]}
                  </Button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                {freeSlots.length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground py-4">Chưa khai báo giờ rảnh.</p>
                ) : (
                  freeSlots.sort((a,b)=>a.dayOfWeek - b.dayOfWeek).map((fs, idx) => (
                    <div key={fs.id} className="flex gap-3 items-center p-2 rounded-md border bg-card border-border">
                      <div className="w-20 text-sm font-medium pl-2">{DAYS[fs.dayOfWeek-1]}</div>
                      <Input type="time" value={fs.startTime} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                         const n = [...freeSlots]; n[idx].startTime = e.target.value; setFreeSlots(n);
                      }} className="w-28 h-8 text-sm" />
                      <span className="text-muted-foreground">-</span>
                      <Input type="time" value={fs.endTime} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                         const n = [...freeSlots]; n[idx].endTime = e.target.value; setFreeSlots(n);
                      }} className="w-28 h-8 text-sm" />
                      <div className="flex-1 text-right pr-2">
                        <Button variant="ghost" size="icon" onClick={() => setFreeSlots(freeSlots.filter(f => f.id !== fs.id))} className="text-destructive hover:bg-destructive/10 h-8 w-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>

        </div>
        <DialogFooter className="pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-primary-foreground">Lưu Thay Đổi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

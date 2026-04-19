import { useState } from 'react';
import { useScheduleStore, TrainingType } from '@/store/useScheduleStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit2, X, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableTableRow({ 
  trainingType, 
  onEdit, 
  onDelete 
}: { 
  trainingType: TrainingType; 
  onEdit: (t: TrainingType) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: trainingType.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="bg-card">
      <TableCell className="w-[40px] pr-0">
        <div {...attributes} {...listeners} className="cursor-grab hover:text-primary active:cursor-grabbing text-muted-foreground p-1">
          <GripVertical className="w-4 h-4" />
        </div>
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: trainingType.color }} />
          {trainingType.name}
        </div>
      </TableCell>
      <TableCell>{trainingType.duration} phút</TableCell>
      <TableCell>
        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold">Ca {trainingType.order}</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onEdit(trainingType)} className="text-muted-foreground hover:text-foreground">
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(trainingType.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function TrainingTypeManager() {
  const { trainingTypes, addTrainingType, updateTrainingType, deleteTrainingType, setTrainingTypes } = useScheduleStore();
  
  const [form, setForm] = useState({ 
    name: '', 
    duration: 60 as string | number, 
    color: '#7C3AED',
    order: 1 as string | number
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    
    if (editingId) {
      updateTrainingType(editingId, {
        name: form.name,
        duration: Number(form.duration) || 60,
        color: form.color,
        order: Number(form.order) || 1
      });
      setEditingId(null);
    } else {
      addTrainingType({
        id: crypto.randomUUID(),
        name: form.name,
        duration: Number(form.duration) || 60,
        order: Number(form.order) || (trainingTypes.length > 0 ? Math.max(...trainingTypes.map(t => t.order)) + 1 : 1),
        color: form.color
      });
    }
    setForm({ name: '', duration: 60, color: '#7C3AED', order: trainingTypes.length + 1 });
  };

  const handleEdit = (t: TrainingType) => {
    setEditingId(t.id);
    setForm({ 
      name: t.name, 
      duration: t.duration, 
      color: t.color || '#7C3AED',
      order: t.order
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ name: '', duration: 60, color: '#7C3AED', order: trainingTypes.length + 1 });
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const sortedTypes = [...trainingTypes].sort((a,b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      });
      const oldIndex = sortedTypes.findIndex((t) => t.id === active.id);
      const newIndex = sortedTypes.findIndex((t) => t.id === over.id);
      
      const moved = arrayMove(sortedTypes, oldIndex, newIndex);
      
      // Recalculate orders smartly: preserve shared orders if items are still adjacent
      let currentOrder = 1;
      let prevOldOrder: number | null = null;
      
      const reordered = moved.map((t, idx) => {
        if (idx === 0) {
          prevOldOrder = t.order;
          return { ...t, order: currentOrder };
        }
        
        if (t.order === prevOldOrder) {
          // Stay in the same tier if adjacent to a same-tier item
          return { ...t, order: currentOrder };
        } else {
          // Move to the next tier
          currentOrder++;
          prevOldOrder = t.order;
          return { ...t, order: currentOrder };
        }
      });
      
      setTrainingTypes(reordered);
    }
  }

  const sortedTypes = [...trainingTypes].sort((a,b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Loại Training</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <Label>Tên loại bài</Label>
            <Input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, name: e.target.value})} placeholder="VD: Onboarding" />
          </div>
          <div className="w-24 space-y-2">
            <Label>Thứ tự</Label>
            <Input type="number" min="1" value={form.order} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, order: e.target.value === '' ? '' : Number(e.target.value)})} />
          </div>
          <div className="w-full sm:w-32 space-y-2">
            <Label>Thời lượng (phút)</Label>
            <Input type="number" min="15" step="15" value={form.duration} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, duration: e.target.value === '' ? '' : Number(e.target.value)})} />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={handleSubmit} className="flex-1 flex gap-2">
               {editingId ? "Lưu" : <><Plus className="w-4 h-4" /> Thêm</>}
            </Button>
            {editingId && (
              <Button variant="outline" size="icon" onClick={handleCancel}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Thời lượng</TableHead>
                <TableHead>Thứ tự ca (Drag)</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <TableBody>
                {sortedTypes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Chưa có loại training nào. Hãy thêm mới.
                    </TableCell>
                  </TableRow>
                ) : (
                  <SortableContext 
                    items={sortedTypes.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sortedTypes.map((t) => (
                      <SortableTableRow 
                        key={t.id} 
                        trainingType={t} 
                        onEdit={handleEdit} 
                        onDelete={deleteTrainingType} 
                      />
                    ))}
                  </SortableContext>
                )}
              </TableBody>
            </DndContext>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

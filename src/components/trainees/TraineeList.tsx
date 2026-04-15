import { useState } from 'react';
import { useScheduleStore, Trainee } from '@/store/useScheduleStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2 } from 'lucide-react';
import TraineeEditor from './TraineeEditor';

export default function TraineeList() {
  const { trainees, deleteTrainee } = useScheduleStore();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTrainee, setEditingTrainee] = useState<Trainee | null>(null);

  const handleAdd = () => {
    setEditingTrainee(null);
    setEditorOpen(true);
  };

  const handleEdit = (t: Trainee) => {
    setEditingTrainee(t);
    setEditorOpen(true);
  };

  return (
    <Card className="border-border">
      <div className="p-6 flex items-center justify-between border-b">
        <h3 className="text-xl font-semibold">Danh Sách Học Viên ({trainees.length})</h3>
        <Button onClick={handleAdd} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2"/> Thêm HV
        </Button>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="pl-6">Tên Học Viên</TableHead>
              <TableHead>Tiến Độ Ca Học</TableHead>
              <TableHead>Khung Giờ Rảnh</TableHead>
              <TableHead className="text-right pr-6">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainees.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                  Chưa có học viên nào. Hãy bắt đầu thêm dữ liệu.
                </TableCell>
              </TableRow>
            )}
            {trainees.map(t => {
              const completedCount = t.requiredSessions.filter(s => s.completed).length;
              const totalCount = t.requiredSessions.length;
              
              return (
                <TableRow key={t.id}>
                  <TableCell className="pl-6 font-medium text-foreground">{t.name}</TableCell>
                  <TableCell>
                     <span className="text-sm font-bold text-primary">{completedCount}</span> <span className="text-sm text-muted-foreground">/ {totalCount} hoàn thành</span>
                  </TableCell>
                  <TableCell>
                    <span className="bg-secondary/40 text-secondary-foreground px-2 py-1 rounded text-xs font-medium">
                      {t.freeSlots.length} khung giờ
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(t)} className="text-muted-foreground hover:text-foreground">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => deleteTrainee(t.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>

      <TraineeEditor 
        open={editorOpen} 
        onOpenChange={setEditorOpen} 
        trainee={editingTrainee} 
      />
    </Card>
  )
}

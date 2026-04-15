import TraineeList from '@/components/trainees/TraineeList';

export default function TraineesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Quản Lý Học Viên</h2>
        <p className="text-muted-foreground">Theo dõi và tùy chỉnh thời gian biểu, thiết lập các ca cần học của mỗi cá nhân.</p>
      </div>
      <TraineeList />
    </div>
  );
}

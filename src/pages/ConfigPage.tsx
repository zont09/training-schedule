import TrainingTypeManager from '@/components/config/TrainingTypeManager';
import WeekConfigEditor from '@/components/config/WeekConfigEditor';

export default function ConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Cấu Hình Hệ Thống</h2>
        <p className="text-muted-foreground">Quản lý các loại training và cấu hình khung giờ tuần lễ.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <TrainingTypeManager />
        <WeekConfigEditor />
      </div>
    </div>
  );
}

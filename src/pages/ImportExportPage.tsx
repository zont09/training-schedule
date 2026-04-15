import { useState } from 'react';
import { useScheduleStore } from '@/store/useScheduleStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, AlertTriangle, CheckCircle } from 'lucide-react';

export default function ImportExportPage() {
  const store = useScheduleStore();
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleExport = () => {
    const data = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      trainingTypes: store.trainingTypes,
      trainees: store.trainees,
      weekConfigs: store.weekConfigs,
      scheduledSessions: store.scheduledSessions
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-data-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        const data = JSON.parse(content);
        
        // Basic validation
        if (!data.version || !data.trainingTypes || !data.trainees) {
          throw new Error("Invalid format");
        }
        
        store.importData({
          trainingTypes: data.trainingTypes,
          trainees: data.trainees,
          weekConfigs: data.weekConfigs || store.weekConfigs,
          scheduledSessions: data.scheduledSessions || []
        });

        setImportStatus("success");
      } catch (err) {
        setImportStatus("error");
      }
      setTimeout(() => setImportStatus(null), 3000);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Export / Import Dữ Liệu</h2>
        <p className="text-muted-foreground">Sao lưu hệ thống hoặc phục hồi từ CSDL cục bộ.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Xuất Dữ Liệu (Export)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Tải toàn bộ trạng thái hệ thống, lịch học viên, các ca rảnh về thành file JSON để lưu trữ.</p>
            <Button onClick={handleExport} className="w-full sm:w-auto">
              <Download className="w-4 h-4 mr-2" /> Tải về file JSON
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nhập Dữ Liệu (Import)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Phục hồi lại dữ liệu từ file JSON. <strong className="text-destructive">Cảnh báo: Thao tác này sẽ ghi đè toàn bộ dữ liệu hiện tại!</strong></p>
            
            <div className="relative">
              <input type="file" accept=".json" onChange={handleImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <Button variant="outline" className="w-full sm:w-auto">
                <Upload className="w-4 h-4 mr-2" /> Chọn file JSON tải lên
              </Button>
            </div>

            {importStatus === "success" && (
              <p className="text-sm text-emerald-600 flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Phục hồi dữ liệu thành công!</p>
            )}
            {importStatus === "error" && (
              <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Lỗi! Định dạng file không hợp lệ.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

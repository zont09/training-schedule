import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import ConfigPage from '@/pages/ConfigPage';
import TraineesPage from '@/pages/TraineesPage';
import SchedulePage from '@/pages/SchedulePage';
import ImportExportPage from '@/pages/ImportExportPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/schedule" replace />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="trainees" element={<TraineesPage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="import-export" element={<ImportExportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

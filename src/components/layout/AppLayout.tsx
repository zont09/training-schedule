import { Outlet, NavLink } from 'react-router-dom';
import { CalendarDays, Users, Settings, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AppLayout() {
  const navItems = [
    { to: '/schedule', icon: CalendarDays, label: 'Lịch Training' },
    { to: '/trainees', icon: Users, label: 'Học Viên' },
    { to: '/config', icon: Settings, label: 'Cấu Hình' },
    { to: '/import-export', icon: Database, label: 'Dữ Liệu' },
  ];

  return (
    <div className="h-screen overflow-hidden bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 h-full bg-card border-r border-border flex flex-col flex-shrink-0">
        <div className="p-6 flex items-center gap-3 text-primary">
          <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
          <h1 className="text-2xl font-bold tracking-tight">Z <span className="text-foreground">Schedule</span></h1>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 card-interactive",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 flex-shrink-0 border-t border-border text-xs text-muted-foreground text-center">
          Phase 1 MVP v1.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-full overflow-y-auto w-full">
        <div className="p-8 max-w-[1600px] mx-auto pb-24">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

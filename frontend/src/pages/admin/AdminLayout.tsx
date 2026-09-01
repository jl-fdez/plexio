import { FC } from 'react';
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Radio,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import PXLogo from '@/components/PXLogo';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export const AdminLayout: FC = () => {
  const { admin, loading, logout } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
          <span className="text-slate-400 text-sm">Cargando panel administrativo...</span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }

  const navItems = [
    {
      label: 'Panel General',
      path: '/admin/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Monitor en Vivo',
      path: '/admin/live-activity',
      icon: Radio,
    },
    {
      label: 'Clientes y Suscripciones',
      path: '/admin/customers',
      icon: Users,
    },
    {
      label: 'Configuración de Plex',
      path: '/admin/plex-settings',
      icon: Server,
    },
    {
      label: 'Historial de Pagos',
      path: '/admin/payments',
      icon: CreditCard,
    },
    {
      label: 'Administradores',
      path: '/admin/users',
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Desktop */}
      <aside className="w-full md:w-64 bg-slate-900/70 border-r border-slate-800/80 backdrop-blur-xl flex flex-col justify-between p-4 shrink-0">
        <div>
          {/* Logo */}
          <div className="px-3 py-4 mb-4 border-b border-slate-800/60">
            <PXLogo size="md" showText={true} />
          </div>

          {/* Menú de Navegación */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Perfil Admin y Logout */}
        <div className="pt-4 mt-6 border-t border-slate-800/60">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-semibold text-xs">
                {admin.username.charAt(0).toUpperCase()}
              </div>
              <div className="truncate">
                <div className="text-xs font-semibold text-white truncate">
                  {admin.username}
                </div>
                <div className="text-[10px] text-slate-400">Administrador</div>
              </div>
            </div>
            <button
              onClick={logout}
              title="Cerrar Sesión"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Área Principal de Contenido */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
};

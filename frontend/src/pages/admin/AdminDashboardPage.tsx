import { FC, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Plus,
  RefreshCw,
  Server,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  CustomerItem,
  DashboardStats,
  getCustomersList,
  getDashboardStats,
} from '@/services/AdminCustomerService';
import { getSavedPlexConfig, SavedPlexConfig } from '@/services/AdminPlexService';

export const AdminDashboardPage: FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [plexConfig, setPlexConfig] = useState<SavedPlexConfig | null>(null);
  const [expiringCustomers, setExpiringCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, plexData, expiringData] = await Promise.all([
        getDashboardStats(),
        getSavedPlexConfig(),
        getCustomersList('', 'EXPIRING_SOON'),
      ]);
      setStats(statsData);
      setPlexConfig(plexData.config);
      setExpiringCustomers(expiringData);
    } catch (e) {
      console.error('Error loading dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Panel de Control
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Resumen operativo de tus clientes, suscripciones e ingresos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 gap-2 rounded-xl"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </Button>
          <Link to="/admin/customers">
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 rounded-xl shadow-lg shadow-indigo-600/30"
            >
              <Plus className="w-4 h-4" />
              Nuevo Cliente
            </Button>
          </Link>
        </div>
      </div>

      {/* Alerta de Configuración de Plex si no está listo */}
      {!plexConfig && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-amber-300 text-sm">
                Servidor Plex no configurado
              </div>
              <div className="text-xs text-amber-200/70">
                Debes vincular tu servidor Plex para que tus clientes puedan consumir el catálogo en Stremio.
              </div>
            </div>
          </div>
          <Link to="/admin/plex-settings">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs">
              Configurar Plex
            </Button>
          </Link>
        </div>
      )}

      {/* Bento Grid de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Clientes Activos */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl relative overflow-hidden backdrop-blur-xl group hover:border-emerald-500/30 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Clientes Activos
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-white tracking-tight">
              {stats?.active_customers || 0}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              De un total de {stats?.total_customers || 0} registrados
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Por Vencer en 3 días */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl relative overflow-hidden backdrop-blur-xl group hover:border-amber-500/30 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Por Vencer (3 Días)
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-white tracking-tight">
              {stats?.expiring_soon_customers || 0}
            </div>
            <div className="text-xs text-amber-400/80 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Requieren recordatorio de pago
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Vencidos / Suspendidos */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl relative overflow-hidden backdrop-blur-xl group hover:border-rose-500/30 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Vencidos / Bloqueados
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-white tracking-tight">
              {(stats?.expired_customers || 0) + (stats?.suspended_customers || 0)}
            </div>
            <div className="text-xs text-rose-400/80 mt-1">
              Sin acceso en Stremio
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-rose-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Ingresos del Mes */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl relative overflow-hidden backdrop-blur-xl group hover:border-indigo-500/30 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ingresos del Mes
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-white tracking-tight">
              ${stats?.monthly_income || 0}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Total acumulado: ${stats?.total_income || 0}
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
        </div>
      </div>

      {/* Fila de Servidor Conectado y Clientes Próximos a Vencer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Servidor Plex */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              Servidor Plex Central
            </h3>
            {plexConfig ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Conectado
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                Desconectado
              </span>
            )}
          </div>

          {plexConfig ? (
            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Nombre Servidor:</span>
                <span className="font-medium text-white">{plexConfig.server_name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Bibliotecas activas:</span>
                <span className="font-medium text-white">{plexConfig.sections?.length || 0}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Transcodificación:</span>
                <span className="font-medium text-white">
                  {plexConfig.transcode_original || plexConfig.transcode_down ? 'Habilitada' : 'Solo Direct Play'}
                </span>
              </div>
              <div className="pt-2">
                <Link to="/admin/plex-settings">
                  <Button variant="outline" size="sm" className="w-full text-xs border-slate-700 bg-slate-800/50 hover:bg-slate-800 rounded-xl">
                    Administrar Plex
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-500 text-xs">
              No has configurado ningún servidor Plex aún.
            </div>
          )}
        </div>

        {/* Clientes que vencen pronto */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Suscripciones Próximas a Vencer
            </h3>
            <Link to="/admin/customers" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {expiringCustomers.length > 0 ? (
            <div className="divide-y divide-slate-800">
              {expiringCustomers.slice(0, 5).map((c) => {
                const expDate = new Date(c.expiration_date).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-sm text-white">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.contact || 'Sin contacto'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-amber-400">Vence: {expDate}</div>
                      <div className="text-[10px] text-slate-500">
                        {c.contact ? (
                          <a
                            href={`https://wa.me/${c.contact.replace(/\D/g, '')}?text=${encodeURIComponent(
                              `Hola ${c.name}, te recordamos que tu suscripción de streaming vence el ${expDate}.`,
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline"
                          >
                            Enviar WhatsApp
                          </a>
                        ) : (
                          'Registrado'
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/40" />
              <span>No hay suscripciones que venzan en los próximos 3 días.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

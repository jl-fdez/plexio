import { FC, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Cpu,
  Eye,
  Film,
  Laptop,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Smartphone,
  Tv,
  User,
  Wifi,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import {
  LiveActivityResponse,
  getLiveSessions,
} from '@/services/AdminActivityService';

export const AdminLiveActivityPage: FC = () => {
  const { toast } = useToast();
  const [data, setData] = useState<LiveActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await getLiveSessions();
      setData(res);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error al obtener sesiones en vivo:', err);
      if (isManual) {
        toast({
          title: 'Error de conexión',
          description: 'No se pudieron consultar las sesiones de Plex.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => {
      if (autoRefreshRef.current) {
        void fetchData(false);
      }
    }, 5000); // Polling cada 5 segundos

    return () => clearInterval(interval);
  }, []);

  const getDeviceIcon = (deviceStr: string) => {
    const d = (deviceStr || '').toLowerCase();
    if (d.includes('tv') || d.includes('box') || d.includes('fire') || d.includes('tizen') || d.includes('webos')) {
      return <Tv className="w-3.5 h-3.5 text-indigo-400" />;
    }
    if (d.includes('phone') || d.includes('android') || d.includes('ios')) {
      return <Smartphone className="w-3.5 h-3.5 text-emerald-400" />;
    }
    return <Laptop className="w-3.5 h-3.5 text-sky-400" />;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3 text-slate-400">
        <div className="w-10 h-10 rounded-full border-4 border-rose-500 border-t-transparent animate-spin" />
        <span className="text-sm">Conectando con el servidor Plex y analizando sesiones activas...</span>
      </div>
    );
  }

  const sessions = data?.sessions || [];
  const stats = data?.stats;

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Monitor de Reproducciones en Vivo
            </h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
              EN DIRECTO
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Supervisa en tiempo real qué están reproduciendo tus clientes en Stremio, su progreso y el uso de recursos.
          </p>
        </div>

        {/* Controles de Refresco */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all ${
              autoRefresh
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            {autoRefresh ? 'Auto-refresco activado (5s)' : 'Auto-refresco pausado'}
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 gap-2 rounded-xl h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Alerta si Plex no está configurado */}
      {data && !data.configured && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">
              Aún no has configurado un servidor Plex central. Vincula tu servidor para activar el monitor en tiempo real.
            </span>
          </div>
          <Link to="/admin/plex-settings">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs">
              Configurar Plex
            </Button>
          </Link>
        </div>
      )}

      {/* Tarjetas de Métricas en Vivo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sesiones */}
        <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Clientes Viendo en Vivo
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {stats?.total_sessions || 0}
            </span>
            <span className="text-xs text-slate-400">cliente(s)</span>
          </div>
        </div>

        {/* Direct Play */}
        <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Direct Play (Directo)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400">
              {stats?.direct_play_count || 0}
            </span>
            <span className="text-xs text-slate-400">0% CPU</span>
          </div>
        </div>

        {/* Transcode */}
        <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Transcodificación
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-400">
              {stats?.transcode_count || 0}
            </span>
            <span className="text-xs text-slate-400">activa(s)</span>
          </div>
        </div>

        {/* Ancho de Banda */}
        <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Ancho de Banda Est.
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Wifi className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {stats?.total_bandwidth_mbps || 0}
            </span>
            <span className="text-xs text-slate-400">Mbps</span>
          </div>
        </div>
      </div>

      {/* Lista de Sesiones Activas */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-400" />
            Transmisiones en Vivo ({sessions.length})
          </h2>
          <span className="text-xs text-slate-500">
            Última actualización: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-500 mb-4">
              <Radio className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-white">
              No hay reproducciones activas en este momento
            </h3>
            <p className="text-xs text-slate-400 max-w-md mt-1.5 leading-relaxed">
              Cuando un cliente inicie la reproducción de una película o serie en Stremio a través de tu addon, aparecerá aquí en tiempo real con su barra de progreso y datos de red.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {sessions.map((session) => {
              const isPlaying = session.state === 'playing';
              const isPaused = session.state === 'paused';
              const isTranscoding = session.stream_mode === 'TRANSCODE';

              return (
                <div
                  key={session.session_key}
                  className="rounded-2xl bg-slate-900/80 border border-slate-800/90 overflow-hidden shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div className="p-5 flex gap-4">
                    {/* Póster / Miniatura */}
                    <div className="w-24 h-36 rounded-xl bg-slate-950 border border-slate-800 shrink-0 overflow-hidden relative shadow-md">
                      {session.poster_url ? (
                        <img
                          src={session.poster_url}
                          alt={session.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700">
                          <Film className="w-8 h-8" />
                        </div>
                      )}

                      {/* Badge de Estado en el Póster */}
                      <div className="absolute top-1.5 left-1.5">
                        {isPlaying && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-bold text-[10px] shadow-sm">
                            <Play className="w-2.5 h-2.5 fill-current" />
                            PLAY
                          </span>
                        )}
                        {isPaused && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-bold text-[10px] shadow-sm">
                            <Pause className="w-2.5 h-2.5 fill-current" />
                            PAUSA
                          </span>
                        )}
                        {!isPlaying && !isPaused && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500 text-slate-950 font-bold text-[10px] shadow-sm">
                            BUFFER
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Información del Contenido y Cliente */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        {/* Título */}
                        <h4 className="text-base font-bold text-white truncate leading-tight">
                          {session.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {session.subtitle}
                        </p>

                        {/* Cliente Identificado / Reproductor */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <div
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                              session.is_identified
                                ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'
                                : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                            }`}
                          >
                            <User className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[140px]">{session.customer_name}</span>
                            {!session.is_identified && (
                              <span className="text-[10px] opacity-75 font-normal ml-0.5">(En red)</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-xs">
                            {getDeviceIcon(session.device_name)}
                            <span className="truncate max-w-[120px]">{session.device_name}</span>
                          </div>

                          {session.player_ip && (
                            <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] text-slate-500 font-mono">
                              {session.player_ip}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Badges Técnicos (Direct Play / Transcode) */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {isTranscoding ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
                            Transcode
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                            Direct Play
                          </span>
                        )}

                        {session.video_resolution && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 uppercase font-mono text-[10px]">
                            {session.video_resolution}p
                          </span>
                        )}

                        {session.video_codec && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 uppercase font-mono text-[10px]">
                            {session.video_codec}
                          </span>
                        )}

                        {session.audio_codec && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 uppercase font-mono text-[10px]">
                            {session.audio_codec}
                          </span>
                        )}

                        {session.bitrate_kbps > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono text-[10px]">
                            {(session.bitrate_kbps / 1000).toFixed(1)} Mbps
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Barra de Progreso */}
                  <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-1.5">
                      <span>{session.view_offset_formatted}</span>
                      <span className="font-semibold text-slate-300">
                        {session.progress_percentage}%
                      </span>
                      <span>{session.duration_formatted}</span>
                    </div>

                    {/* Barra */}
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          isPlaying
                            ? 'bg-rose-500'
                            : isPaused
                            ? 'bg-amber-500'
                            : 'bg-indigo-500'
                        }`}
                        style={{ width: `${session.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

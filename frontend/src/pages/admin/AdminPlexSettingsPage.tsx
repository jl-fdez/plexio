import { FC, useEffect, useState } from 'react';
import {
  LogOut,
  Save,
  Server,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import useClientIdentifier from '@/hooks/useClientIdentifier';
import usePMSSections from '@/hooks/usePMSSections';
import { useToast } from '@/hooks/useToast';
import {
  SavedPlexConfig,
  deletePlexServerConfig,
  getSavedPlexConfig,
  savePlexServerConfig,
  testPlexConnection,
} from '@/services/AdminPlexService';
import {
  createAuthPin,
  getAuthToken,
  getPlexServers,
  getPlexUser,
} from '@/services/PlexService';

export const AdminPlexSettingsPage: FC = () => {
  const { toast } = useToast();
  const clientIdentifier = useClientIdentifier();

  const [plexToken, setPlexToken] = useState<string | null>(() =>
    localStorage.getItem('adminPlexToken'),
  );
  const [plexUser, setPlexUser] = useState<any>(null);
  const [servers, setServers] = useState<any[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);

  // Configuración actual guardada en DB
  const [savedConfig, setSavedConfig] = useState<SavedPlexConfig | null>(null);

  // Campos del formulario
  const [selectedServerName, setSelectedServerName] = useState('');
  const [discoveryUrl, setDiscoveryUrl] = useState('');
  const [streamingUrl, setStreamingUrl] = useState('');
  const [selectedSections, setSelectedSections] = useState<any[]>([]);
  const [transcodeOriginal, setTranscodeOriginal] = useState(false);
  const [transcodeDown, setTranscodeDown] = useState(false);
  const [transcodeQualities, setTranscodeQualities] = useState<string[]>(['1080p', '720p']);
  const [includePlexTv, setIncludePlexTv] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testingDiscovery, setTestingDiscovery] = useState(false);

  const selectedServer = servers.find((s) => s.name === selectedServerName);
  const availableSections = usePMSSections(discoveryUrl, selectedServer?.accessToken || null);

  // Cargar configuración guardada en DB
  const loadSavedConfig = async () => {
    try {
      const res = await getSavedPlexConfig();
      if (res.configured && res.config) {
        setSavedConfig(res.config);
        setSelectedServerName(res.config.server_name);
        setDiscoveryUrl(res.config.discovery_url);
        setStreamingUrl(res.config.streaming_url);
        setSelectedSections(res.config.sections);
        setTranscodeOriginal(res.config.transcode_original);
        setTranscodeDown(res.config.transcode_down);
        setTranscodeQualities(res.config.transcode_qualities || ['1080p', '720p']);
        setIncludePlexTv(res.config.include_plex_tv);
      }
    } catch (e) {
      console.error('Error loading saved config:', e);
    }
  };

  useEffect(() => {
    void loadSavedConfig();
  }, []);

  // Cargar servidores y usuario si hay token de Plex del admin
  useEffect(() => {
    if (!plexToken || !clientIdentifier) return;

    const fetchPlexData = async () => {
      try {
        const [userData, serversData] = await Promise.all([
          getPlexUser(plexToken, clientIdentifier),
          getPlexServers(plexToken, clientIdentifier),
        ]);
        setPlexUser(userData);
        setServers(serversData);

        if (serversData.length > 0 && !selectedServerName) {
          const first = serversData[0];
          setSelectedServerName(first.name);
          const remoteConn = first.connections.find((c: any) => !c.local);
          if (remoteConn) {
            setDiscoveryUrl(remoteConn.uri);
            setStreamingUrl(remoteConn.uri);
          }
        }
      } catch (err) {
        console.error('Error fetching Plex servers:', err);
      }
    };

    void fetchPlexData();
  }, [plexToken, clientIdentifier]);

  const [manualToken, setManualToken] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Login OAuth de Plex
  const handlePlexLogin = async () => {
    try {
      setLoginLoading(true);
      const authPin = await createAuthPin(clientIdentifier);

      const params = new URLSearchParams({
        clientID: clientIdentifier,
        code: authPin.code,
        'context[device][product]': 'Plexio',
        'context[device][platform]': 'Web',
        'context[device][device]': 'Browser',
        'context[device][model]': 'Plexio Web',
      });

      const authUrl = `https://app.plex.tv/auth/#!?${params.toString()}`;
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authUrl,
        'PlexAuth',
        `width=${width},height=${height},left=${left},top=${top}`,
      );

      if (!popup) {
        window.open(authUrl, '_blank');
      }

      const pollInterval = setInterval(async () => {
        try {
          const authToken = await getAuthToken(authPin, clientIdentifier);
          if (authToken) {
            clearInterval(pollInterval);
            if (popup && !popup.closed) {
              popup.close();
            }
            setPlexToken(authToken);
            localStorage.setItem('adminPlexToken', authToken);
            setLoginLoading(false);
            toast({
              title: '¡Sesión Iniciada con Plex!',
              description: 'Cuenta de Plex vinculada con éxito.',
              variant: 'success',
            });
          }
        } catch {
          // continuar sondeo
        }
      }, 1500);

      setTimeout(() => {
        clearInterval(pollInterval);
        setLoginLoading(false);
      }, 120000);
    } catch (error) {
      console.error('Error during login:', error);
      setLoginLoading(false);
    }
  };

  const handleManualTokenLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    const cleanToken = manualToken.trim();
    setPlexToken(cleanToken);
    localStorage.setItem('adminPlexToken', cleanToken);
    toast({
      title: 'Token Aplicado',
      description: 'Cargando servidores con el token proporcionado...',
      variant: 'success',
    });
  };

  const handlePlexLogout = () => {
    setPlexToken(null);
    localStorage.removeItem('adminPlexToken');
    setPlexUser(null);
    setServers([]);
  };

  const handleSaveConfig = async () => {
    if (!selectedServer || !discoveryUrl || !streamingUrl) {
      toast({
        title: 'Error',
        description: 'Debes seleccionar el servidor y las URLs de conexión.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      await savePlexServerConfig({
        server_name: selectedServer.name,
        access_token: selectedServer.accessToken,
        discovery_url: discoveryUrl,
        streaming_url: streamingUrl,
        sections: selectedSections,
        transcode_original: transcodeOriginal,
        transcode_down: transcodeDown,
        transcode_qualities: transcodeQualities,
        include_plex_tv: includePlexTv,
      });

      toast({
        title: '¡Configuración Guardada!',
        description: 'Tu servidor Plex ahora es la fuente central para todos tus clientes.',
        variant: 'success',
      });
      void loadSavedConfig();
    } catch (err: any) {
      toast({
        title: 'Error al guardar',
        description: err.response?.data?.detail || 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!window.confirm('¿Deseas desvincular el servidor Plex central?')) return;
    try {
      await deletePlexServerConfig();
      setSavedConfig(null);
      toast({
        title: 'Configuración Eliminada',
        description: 'Se desvinculó el servidor central.',
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar.',
        variant: 'destructive',
      });
    }
  };

  const testDiscovery = async () => {
    if (!selectedServer || !discoveryUrl) return;
    setTestingDiscovery(true);
    const ok = await testPlexConnection(discoveryUrl, selectedServer.accessToken);
    setTestingDiscovery(false);
    if (ok) {
      toast({
        title: '¡Conexión Exitosa!',
        description: 'El backend pudo conectarse a tu Plex correctamente.',
        variant: 'success',
      });
    } else {
      toast({
        title: 'Fallo de Conexión',
        description: 'No se pudo conectar. Verifica que el servidor esté activo y accesible.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
          Configuración Central de Plex
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Vincula tu servidor Plex maestro. Tus clientes consumirán este catálogo de forma segura.
        </p>
      </div>

      {/* Estado Actual Guardado */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Estado del Servidor Central
              </h2>
              <p className="text-xs text-slate-400">
                {savedConfig
                  ? `Vinculado: ${savedConfig.server_name} (${savedConfig.sections.length} secciones)`
                  : 'Ningún servidor Plex guardado actualmente.'}
              </p>
            </div>
          </div>
          {savedConfig && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeleteConfig}
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-xl text-xs gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Desvincular
            </Button>
          )}
        </div>
      </div>

      {/* Asistente de Conexión y Selección de Servidor */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-xl space-y-6">
        <div className="border-b border-slate-800 pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">1. Cuenta de Plex del Administrador</h2>
              <p className="text-xs text-slate-400">
                Vincula tu cuenta de Plex para cargar tus servidores y bibliotecas
              </p>
            </div>
            {plexUser ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-semibold text-white">{plexUser.username}</div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1 justify-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Sesión Activa
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handlePlexLogout}
                  className="text-slate-400 hover:text-rose-400 p-2 rounded-xl"
                  title="Cerrar sesión de Plex"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handlePlexLogin}
                  disabled={loginLoading}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20"
                >
                  {loginLoading ? 'Esperando autorización...' : 'Iniciar Sesión con Plex'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="border-slate-800 text-slate-300 text-xs rounded-xl"
                >
                  {showManualInput ? 'Ocultar' : 'Pegar Token Manual'}
                </Button>
              </div>
            )}
          </div>

          {/* Formulario de Token Manual */}
          {!plexUser && showManualInput && (
            <form
              onSubmit={handleManualTokenLogin}
              className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3"
            >
              <div className="text-xs font-semibold text-slate-300">
                Ingresar X-Plex-Token Manualmente:
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Pega aquí tu X-Plex-Token..."
                  className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <Button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-xl text-xs px-4"
                >
                  Vincular Token
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Puedes obtener tu token abriendo cualquier vídeo en tu Plex Web, haciendo clic en "Ver información / XML" y copiando el valor de <code className="text-amber-400">X-Plex-Token</code> en la URL.
              </p>
            </form>
          )}
        </div>

        {/* Si hay sesión en Plex, mostrar selección de servidor y opciones */}
        {plexUser && (
          <div className="space-y-6 pt-2">
            <h2 className="text-lg font-bold text-white">2. Configuración del Servidor y Streaming</h2>

            {/* Selector de Servidor */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Selecciona tu Servidor Plex
              </label>
              <select
                value={selectedServerName}
                onChange={(e) => {
                  const sName = e.target.value;
                  setSelectedServerName(sName);
                  const found = servers.find((s) => s.name === sName);
                  if (found) {
                    const remoteConn = found.connections.find((c: any) => !c.local);
                    if (remoteConn) {
                      setDiscoveryUrl(remoteConn.uri);
                      setStreamingUrl(remoteConn.uri);
                    }
                  }
                }}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {servers.map((s, idx) => (
                  <option key={idx} value={s.name}>
                    {s.name} {!s.owned ? '(Compartido)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedServer && (
              <>
                {/* Discovery URL */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      URL de Descubrimiento (Discovery URL)
                    </label>
                    <button
                      type="button"
                      onClick={testDiscovery}
                      disabled={testingDiscovery}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      {testingDiscovery ? 'Probando...' : 'Probar Conexión'}
                    </button>
                  </div>
                  <select
                    value={discoveryUrl}
                    onChange={(e) => setDiscoveryUrl(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {selectedServer.connections
                      .filter((c: any) => !c.local)
                      .map((c: any, idx: number) => (
                        <option key={idx} value={c.uri}>
                          {c.address}:{c.port} {c.relay ? '(Relay)' : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    La dirección que usará el backend para consultar metadatos y episodios.
                  </p>
                </div>

                {/* Streaming URL */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    URL de Streaming
                  </label>
                  <select
                    value={streamingUrl}
                    onChange={(e) => setStreamingUrl(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {selectedServer.connections.map((c: any, idx: number) => (
                      <option key={idx} value={c.uri}>
                        {c.address}:{c.port} {c.local ? '(Local)' : ''} {c.relay ? '(Relay)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    La dirección que recibirán los clientes de Stremio para reproducir el vídeo.
                  </p>
                </div>

                {/* Bibliotecas / Secciones */}
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Bibliotecas a Exponer a los Clientes
                  </label>
                  {availableSections.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availableSections.map((sec: any) => {
                        const isChecked = selectedSections.some((s) => s.key === sec.key);
                        return (
                          <label
                            key={sec.key}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                              isChecked
                                ? 'bg-indigo-600/15 border-indigo-500/40 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSections([
                                    ...selectedSections,
                                    { key: sec.key, title: sec.title, type: sec.type },
                                  ]);
                                } else {
                                  setSelectedSections(
                                    selectedSections.filter((s) => s.key !== sec.key),
                                  );
                                }
                              }}
                              className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium">{sec.title}</span>
                            <span className="text-[10px] text-slate-500 ml-auto uppercase">
                              {sec.type}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 py-3">
                      Cargando secciones desde la URL seleccionada...
                    </div>
                  )}
                </div>

                {/* Opciones de Transcoding */}
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Opciones de Reproducción y Transcodificación
                  </label>

                  <label className="flex items-center justify-between py-2 border-b border-slate-800/80 cursor-pointer">
                    <div>
                      <div className="text-sm font-medium text-white">
                        Incluir Transcodificación Original (HLS)
                      </div>
                      <div className="text-xs text-slate-400">
                        Proporciona un stream HLS transcodificado con calidad original.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={transcodeOriginal}
                      onChange={(e) => setTranscodeOriginal(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>

                  <label className="flex items-center justify-between py-2 cursor-pointer">
                    <div>
                      <div className="text-sm font-medium text-white">
                        Incluir Transcodificación en Resoluciones Menores
                      </div>
                      <div className="text-xs text-slate-400">
                        Genera flujos a 1080p, 720p y 480p para conexiones lentas.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={transcodeDown}
                      onChange={(e) => setTranscodeDown(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                </div>

                {/* Botón Guardar */}
                <div className="pt-3">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Guardando Configuración...' : 'Guardar y Activar Servidor Central'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

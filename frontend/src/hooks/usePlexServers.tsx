import { useEffect, useState } from 'react';
import useClientIdentifier from '@/hooks/useClientIdentifier.tsx';
import { PlexToken } from '@/hooks/usePlexToken.tsx';
import { getPlexServers } from '@/services/PlexService.tsx';

export interface UsePlexServersResult {
  servers: PlexServer[];
  loading: boolean;
  error: string | null;
}

const usePlexServers = (plexToken: PlexToken | null): UsePlexServersResult => {
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const clientIdentifier = useClientIdentifier();

  useEffect(() => {
    if (!clientIdentifier || !plexToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const fetchPlexServers = async (): Promise<void> => {
      try {
        const plexServers = await getPlexServers(plexToken, clientIdentifier);
        setServers(plexServers);
      } catch (err: any) {
        console.error('Failed to fetch Plex servers:', err);
        setError(err?.message || 'Error al obtener servidores de Plex');
      } finally {
        setLoading(false);
      }
    };

    void fetchPlexServers();
  }, [clientIdentifier, plexToken]);

  return { servers, loading, error };
};

export default usePlexServers;

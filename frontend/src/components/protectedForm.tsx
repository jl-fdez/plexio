import { FC } from 'react';
import ConfigurationForm from '@/components/configurationForm';
import Loading from '@/components/loading.tsx';
import Login from '@/components/login.tsx';
import { Button } from '@/components/ui/button.tsx';
import usePlexServers from '@/hooks/usePlexServers.tsx';

interface Props {
  plexToken: string | null;
  plexUser: PlexUser | null | undefined;
  setPlexToken: (token: string | null) => void;
}

const ProtectedForm: FC<Props> = ({ plexToken, plexUser, setPlexToken }) => {
  const { servers, loading, error } = usePlexServers(plexToken);

  if (plexUser === null) {
    return <Login setPlexToken={setPlexToken} />;
  }

  if (plexUser === undefined || loading) {
    return <Loading />;
  }

  if (error || !servers.length) {
    return (
      <div className="border rounded-lg p-6 text-center space-y-4">
        <h2 className="text-lg font-semibold">
          {error ? 'Error al conectar con Plex' : 'No se encontraron servidores de Plex'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {error
            ? error
            : 'No se detectó ningún Plex Media Server asociado o compartido con tu cuenta de Plex.'}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
          <Button variant="destructive" onClick={() => setPlexToken(null)}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return <ConfigurationForm servers={servers} />;
};

export default ProtectedForm;

import { FC, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import useClientIdentifier from '@/hooks/useClientIdentifier.tsx';
import { createAuthPin, getAuthToken } from '@/services/PlexService.tsx';

interface Props {
  setPlexToken: (token: string | null) => void;
}

const Login: FC<Props> = ({ setPlexToken }) => {
  const clientIdentifier = useClientIdentifier();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
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
            setLoading(false);
          }
        } catch {
          // esperar siguiente intervalo
        }
      }, 1500);

      const timeoutId = setTimeout(() => {
        clearInterval(pollInterval);
        setLoading(false);
      }, 120000);

      // Si el usuario cierra el popup manualmente
      const checkClosedInterval = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(checkClosedInterval);
          setTimeout(async () => {
            const authToken = await getAuthToken(authPin, clientIdentifier);
            if (authToken) {
              clearInterval(pollInterval);
              clearTimeout(timeoutId);
              setPlexToken(authToken);
            }
            setLoading(false);
          }, 1000);
        }
      }, 1000);
    } catch (error) {
      console.error('Error during login:', error);
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-6">
      <h1 className="text-xl font-bold text-center ">
        Plexio: Integración de Plex para Stremio
      </h1>
      <p className="text-sm text-center mt-2">
        Conecta de forma fluida tus cuentas de Plex y Stremio para disfrutar de
        tu contenido multimedia de Plex directamente dentro de Stremio.
      </p>
      <div className="mt-6">
        <Button onClick={handleLogin} className="w-full" disabled={loading}>
          {loading ? 'Esperando autorización en Plex...' : 'Iniciar sesión con Plex'}
        </Button>
      </div>
    </div>
  );
};

export default Login;

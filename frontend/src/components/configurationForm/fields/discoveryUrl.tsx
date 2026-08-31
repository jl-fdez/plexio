import { FC, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { ConfigurationFormType } from '@/components/configurationForm/formSchema.tsx';
import { parseUrlToIpPort } from '@/components/configurationForm/utils.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx';
import { useToast } from '@/hooks/useToast';
import { isServerAliveRemote } from '@/services/BackendService.tsx';

interface Props {
  form: UseFormReturn<ConfigurationFormType>;
  server: any;
}

export const DiscoveryUrlField: FC<Props> = ({ form, server }) => {
  const { toast } = useToast();

  const [testInProgress, setTestInProgress] = useState(false);
  const discoveryUrl = form.watch('discoveryUrl');

  const testUrl = () => {
    setTestInProgress(true);
    isServerAliveRemote(discoveryUrl, server.accessToken).then((alive) => {
      setTestInProgress(false);
      const ipPort = parseUrlToIpPort(discoveryUrl);
      if (alive) {
        toast({
          title: '¡Prueba de URL de Descubrimiento Exitosa!',
          description: `El backend de Plexio se conectó correctamente a tu servidor en ${ipPort}.`,
          variant: 'success',
          duration: 30 * 1000,
        });
      } else {
        toast({
          title: '¡Error en la Prueba de URL de Descubrimiento!',
          description: `El backend de Plexio no pudo acceder a tu servidor en ${ipPort}. 
                        Inténtalo de nuevo o selecciona otra URL. Asegúrate de que tu servidor sea accesible públicamente, 
                        o considera usar Plex Relay si el servidor está detrás de un firewall o CGNAT.`,
          variant: 'destructive',
          duration: 30 * 1000,
        });
      }
    });
  };

  return (
    <FormField
      control={form.control}
      name="discoveryUrl"
      render={({ field }) => (
        <FormItem className="rounded-lg border p-2">
          <FormLabel className="text-base">URL de Descubrimiento (Discovery URL)</FormLabel>
          <div className="flex">
            <Select
              onValueChange={field.onChange}
              defaultValue=""
              value={field.value}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una URL de descubrimiento" />
                </SelectTrigger>
              </FormControl>
              {server.connections.filter((conn: any) => !conn.local).length >
                0 && (
                <SelectContent>
                  {server.connections
                    .filter((conn: any) => !conn.local)
                    .map((conn: any, index: number) => (
                      <SelectItem key={index} value={conn.uri}>
                        {conn.relay && (
                          <Badge className="mr-1.5" variant="secondary">
                            retransmisión
                          </Badge>
                        )}
                        {`${conn.address}:${conn.port}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              )}
            </Select>
            <Button
              className="ml-2.5 h-10 w-16"
              type="button"
              disabled={testInProgress || !discoveryUrl}
              onClick={testUrl}
            >
              {testInProgress ? (
                <div className="w-5 h-5 rounded-full animate-spin border-t-2" />
              ) : (
                'Probar'
              )}
            </Button>
          </div>
          <FormDescription>
            Selecciona la URL pública o remota de tu servidor Plex.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

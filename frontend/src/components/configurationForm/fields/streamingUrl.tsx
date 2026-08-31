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
import { isServerAliveLocal } from '@/services/PMSService.tsx';

interface Props {
  form: UseFormReturn<ConfigurationFormType>;
  server: any;
}

export const StreamingUrlField: FC<Props> = ({ form, server }) => {
  const { toast } = useToast();

  const [testInProgress, setTestInProgress] = useState(false);
  const streamingUrl = form.watch('streamingUrl');

  const testUrl = () => {
    setTestInProgress(true);
    isServerAliveLocal(streamingUrl, server.accessToken).then((alive) => {
      setTestInProgress(false);
      const ipPort = parseUrlToIpPort(streamingUrl);
      if (alive) {
        toast({
          title: '¡Prueba de URL de Streaming Exitosa!',
          description: `Tu dispositivo accedió correctamente a la URL de Streaming en ${ipPort}.
                        La reproducción funcionará si se accede desde este dispositivo o red.`,
          variant: 'success',
          duration: 30 * 1000,
        });
      } else {
        toast({
          title: '¡Error en la Prueba de URL de Streaming!',
          description: `Tu dispositivo no pudo acceder a la URL de Streaming en ${ipPort}. 
                        Si planeas reproducir desde otro dispositivo o red, esto podría ser normal. 
                        De lo contrario, inténtalo de nuevo o selecciona otra URL. 
                        Si tu servidor está detrás de un firewall o CGNAT, considera usar Plex Relay.`,
          variant: 'destructive',
          duration: 30 * 1000,
        });
      }
    });
  };

  return (
    <FormField
      control={form.control}
      name="streamingUrl"
      render={({ field }) => (
        <FormItem className="rounded-lg border p-2">
          <FormLabel className="text-base">URL de Streaming</FormLabel>
          <div className="flex">
            <Select
              onValueChange={field.onChange}
              defaultValue=""
              value={field.value}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una URL de streaming" />
                </SelectTrigger>
              </FormControl>
              {server.connections.length > 0 && (
                <SelectContent>
                  {server.connections.map((conn: any, index: number) => (
                    <SelectItem key={index} value={conn.uri}>
                      {conn.local && (
                        <Badge className="mr-1.5" variant="secondary">
                          local
                        </Badge>
                      )}
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
              disabled={testInProgress || !streamingUrl}
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
            Selecciona la URL de tu servidor Plex para la transmisión y reproducción de contenido en Stremio.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

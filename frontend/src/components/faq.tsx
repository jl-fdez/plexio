import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion.tsx';

const QUESTIONS = [
  {
    id: 'what-is-plexio',
    question: `¿Qué es Plexio?`,
    answer: `Plexio es un addon que conecta Plex con Stremio, permitiéndote reproducir tu contenido de Plex directamente 
             dentro de la interfaz de Stremio. Te permite integrar tu biblioteca multimedia de Plex, gestionar metadatos 
             y disfrutar de una experiencia de reproducción fluida en todos tus dispositivos.`,
  },
  {
    id: 'is-plexio-secure',
    question: `¿Es seguro Plexio?`,
    answer: `Sí, Plexio es seguro. El código fuente es abierto y está disponible en GitHub, permitiéndote revisar y verificar su seguridad.
             Utiliza el protocolo OAuth oficial para un inicio de sesión seguro sin necesidad de compartir tu contraseña de Plex. Además, 
             puedes revocar el acceso en cualquier momento desde la pestaña "Dispositivos autorizados" en los ajustes de tu cuenta de Plex.`,
  },
  {
    id: 'how-plexio-work',
    question: `¿Cómo funciona Plexio?`,
    answer: `Plexio utiliza la API de Plex para asociar los datos de IMDb de Stremio con el ID multimedia correspondiente en Plex y proporcionar los metadatos
             de tu contenido. El addon en sí no transmite el vídeo a través de sus servidores; solo proporciona los enlaces y metadatos. La transmisión ocurre
             directamente entre tu aplicación de Stremio y tu propio Plex Media Server.`,
  },
  {
    id: 'where-find-support',
    question: `¿Dónde puedo obtener soporte?`,
    answer: `Puedes encontrar soporte en nuestro canal de Discord, a través de las "Issues" de GitHub o por correo electrónico. Los enlaces a todos 
             los canales de soporte se encuentran en la esquina superior izquierda de la página.`,
  },
  {
    id: 'can-self-host',
    question: `¿Puedo auto-alojarlo (self-host)?`,
    answer: `Sí, puedes auto-alojar Plexio fácilmente con Docker. Las instrucciones detalladas están disponibles en el archivo README del repositorio.`,
  },
  {
    id: 'what-is-transcoded',
    question: `¿Qué es una transmisión transcodificada (transcode)?`,
    answer: `Una transmisión transcodificada es una versión de tu archivo multimedia que el servidor Plex convierte en tiempo real a un formato o resolución 
             diferente para adaptarse a tu dispositivo o ancho de banda. La reproducción directa (Direct Play) suele ser mejor, ya que reproduce el archivo 
             original sin pérdida de calidad. Usa la transcodificación si tu dispositivo no soporta el formato original o si tu conexión requiere una tasa de bits menor.`,
  },
];

const FAQ = () => {
  return (
    <div className="mt-5 mb-5 border rounded-lg p-6">
      <h2 className="text-md font-semibold">Preguntas Frecuentes</h2>
      <Accordion type="multiple" className="mt-4">
        {QUESTIONS.map((item) => (
          <AccordionItem value={item.id} key={item.id}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default FAQ;

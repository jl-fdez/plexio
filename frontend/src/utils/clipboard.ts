/**
 * Copia texto al portapapeles de manera universal, funcionando tanto en entornos
 * seguros (HTTPS / localhost) como en entornos HTTP directos (IP pública sin SSL).
 */
export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;

  // 1. Intentar con la API moderna navigator.clipboard si está disponible y en contexto seguro
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Fallo navigator.clipboard.writeText, usando fallback execCommand:', err);
    }
  }

  // 2. Fallback universal usando textarea temporal y document.execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Evitar que haga scroll o sea visible
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    // Para dispositivos móviles (iOS / Android)
    textArea.setSelectionRange(0, 99999);
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      return true;
    }
  } catch (err) {
    console.error('Error al copiar con document.execCommand:', err);
  }

  // 3. Fallback de emergencia con prompt en caso extremo
  try {
    window.prompt('Copia el enlace manualmente:', text);
    return true;
  } catch {
    return false;
  }
};

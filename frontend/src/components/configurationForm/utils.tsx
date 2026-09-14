export const parseUrlToIpPort = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');

    const ipMatch = hostname.match(/^(\d+-\d+-\d+-\d+)/);
    if (ipMatch) {
      const ip = ipMatch[1].replace(/-/g, '.');
      return `${ip}:${port}`;
    }

    return `${hostname}:${port}`;
  } catch {
    return url;
  }
};

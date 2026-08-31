import axios from 'axios';

const PLEX_PRODUCT_NAME = 'Plexio';
const PLEX_API_URL = 'https://plex.tv/api/v2';

export const createAuthPin = async (
  clientIdentifier: string,
): Promise<AuthPin> => {
  try {
    const response = await axios.post(
      `${PLEX_API_URL}/pins`,
      {},
      {
        params: {
          strong: false,
        },
        headers: {
          'X-Plex-Product': PLEX_PRODUCT_NAME,
          'X-Plex-Client-Identifier': clientIdentifier,
          Accept: 'application/json',
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error('Error creating PIN:', error);
    throw error;
  }
};

export const getAuthToken = async (
  authPin: AuthPin,
  clientIdentifier: string,
): Promise<string | null> => {
  try {
    const response = await axios.get(`${PLEX_API_URL}/pins/${authPin.id}`, {
      params: {
        code: authPin.code,
        'X-Plex-Client-Identifier': clientIdentifier,
      },
      headers: {
        'X-Plex-Client-Identifier': clientIdentifier,
        Accept: 'application/json',
      },
    });
    return response.data?.authToken || null;
  } catch (error) {
    console.error('Error fetching auth token:', error);
    return null;
  }
};

export const getPlexUser = async (
  token: string,
  clientIdentifier: string,
): Promise<PlexUser | null> => {
  try {
    const response = await axios.get(`${PLEX_API_URL}/user`, {
      params: {
        'X-Plex-Product': PLEX_PRODUCT_NAME,
        'X-Plex-Client-Identifier': clientIdentifier,
        'X-Plex-Token': token,
      },
      headers: {
        'X-Plex-Product': PLEX_PRODUCT_NAME,
        'X-Plex-Client-Identifier': clientIdentifier,
        'X-Plex-Token': token,
        Accept: 'application/json',
      },
    });

    if (response.status !== 200) {
      return null;
    }

    return response.data;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
};

export const getPlexServers = async (
  token: string,
  clientIdentifier: string,
): Promise<PlexServer[]> => {
  try {
    const response = await axios.get(`${PLEX_API_URL}/resources`, {
      params: {
        includeHttps: 1,
        includeRelay: 1,
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': clientIdentifier,
      },
      headers: {
        'X-Plex-Product': PLEX_PRODUCT_NAME,
        'X-Plex-Client-Identifier': clientIdentifier,
        'X-Plex-Token': token,
        Accept: 'application/json',
      },
    });

    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Respuesta inválida del servidor de Plex');
    }

    return response.data.filter(
      (server: any) =>
        server.provides &&
        server.provides.includes('server') &&
        'accessToken' in server,
    );
  } catch (error) {
    console.error('Error fetching Plex servers:', error);
    throw error;
  }
};

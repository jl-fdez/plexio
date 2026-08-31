import axios from 'axios';
import { getAuthHeaders } from './AdminAuthService';

const API_BASE = '/api/admin/plex';

export interface SavedPlexConfig {
  id: number;
  server_name: string;
  discovery_url: string;
  streaming_url: string;
  sections: Array<{ key: string; title: string; type: string }>;
  transcode_original: boolean;
  transcode_down: boolean;
  transcode_qualities: string[];
  include_plex_tv: boolean;
  updated_at: string;
}

export interface PlexConfigPayload {
  server_name: string;
  access_token: string;
  discovery_url: string;
  streaming_url: string;
  sections: Array<{ key: string; title: string; type: string }>;
  transcode_original: boolean;
  transcode_down: boolean;
  transcode_qualities: string[];
  include_plex_tv: boolean;
}

export const getSavedPlexConfig = async (): Promise<{
  configured: boolean;
  config: SavedPlexConfig | null;
}> => {
  const res = await axios.get(`${API_BASE}/config`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const savePlexServerConfig = async (
  payload: PlexConfigPayload,
): Promise<{ success: boolean; message: string }> => {
  const res = await axios.post(`${API_BASE}/config`, payload, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const deletePlexServerConfig = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  const res = await axios.delete(`${API_BASE}/config`, {
    headers: getAuthHeaders(),
  });
  return res.data;
};

export const testPlexConnection = async (
  url: string,
  token: string,
): Promise<boolean> => {
  try {
    const res = await axios.get(`${API_BASE}/test-connection`, {
      params: { url, token },
      headers: getAuthHeaders(),
    });
    return res.data.success;
  } catch {
    return false;
  }
};

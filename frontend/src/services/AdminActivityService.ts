import axios from 'axios';
import { getAuthHeaders } from './AdminAuthService';

const API_BASE = '/api/admin/activity';

export interface LiveSessionStats {
  total_sessions: number;
  direct_play_count: number;
  transcode_count: number;
  total_bandwidth_kbps: number;
  total_bandwidth_mbps: number;
}

export interface LiveSessionItem {
  session_key: string;
  rating_key: string;
  media_type: 'movie' | 'episode' | 'track' | 'clip' | string;
  title: string;
  subtitle: string;
  year?: number | string;
  poster_url: string | null;
  art_url: string | null;
  state: 'playing' | 'paused' | 'buffering' | string;
  duration_ms: number;
  view_offset_ms: number;
  duration_formatted: string;
  view_offset_formatted: string;
  progress_percentage: number;
  player_name: string;
  player_product: string;
  player_device: string;
  player_platform: string;
  player_ip: string;
  stream_mode: 'DIRECT_PLAY' | 'DIRECT_STREAM' | 'TRANSCODE';
  video_resolution: string;
  video_codec: string;
  audio_codec: string;
  bitrate_kbps: number;
  is_identified: boolean;
  customer_id: number | null;
  customer_name: string;
  customer_token: string | null;
  device_name: string;
}

export interface LiveActivityResponse {
  configured: boolean;
  server_name: string;
  stats: LiveSessionStats;
  sessions: LiveSessionItem[];
}

export const getLiveSessions = async (): Promise<LiveActivityResponse> => {
  const response = await axios.get<LiveActivityResponse>(`${API_BASE}/live-sessions`, {
    headers: getAuthHeaders(),
  });
  return response.data;
};

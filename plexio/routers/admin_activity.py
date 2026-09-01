import logging
from typing import Annotated
from aiohttp import ClientSession
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from yarl import URL

from plexio.auth.security import get_current_admin
from plexio.db.database import get_db
from plexio.db.models import AdminUser, CustomerDevice, PlexServerConfig
from plexio.dependencies import get_http_client
from plexio.plex.media_server_api import get_active_plex_sessions

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/admin/activity', tags=['Admin Live Activity'])


def format_time_ms(ms: int) -> str:
    """Convierte milisegundos a formato HH:MM:SS o MM:SS"""
    if not ms or ms <= 0:
        return '00:00'
    seconds = int(ms // 1000)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f'{hours:02d}:{minutes:02d}:{secs:02d}'
    return f'{minutes:02d}:{secs:02d}'


@router.get('/live-sessions')
async def get_live_sessions(
    admin: AdminUser = Depends(get_current_admin),
    http: Annotated[ClientSession, Depends(get_http_client)] = None,
    db: AsyncSession = Depends(get_db),
):
    # 1. Obtener configuración del servidor Plex central
    stmt_cfg = select(PlexServerConfig).order_by(PlexServerConfig.id.desc())
    res_cfg = await db.execute(stmt_cfg)
    plex_config = res_cfg.scalars().first()

    if not plex_config or not plex_config.discovery_url or not plex_config.access_token:
        return {
            'configured': False,
            'server_name': 'No configurado',
            'stats': {
                'total_sessions': 0,
                'direct_play_count': 0,
                'transcode_count': 0,
                'total_bandwidth_kbps': 0,
                'total_bandwidth_mbps': 0.0,
            },
            'sessions': [],
        }

    # 2. Consultar sesiones activas en Plex Media Server (/status/sessions)
    raw_sessions = await get_active_plex_sessions(
        client=http,
        url=URL(plex_config.discovery_url),
        token=plex_config.access_token,
    )

    # 3. Cargar dispositivos registrados con sus clientes para cruce de datos
    stmt_dev = select(CustomerDevice).options(selectinload(CustomerDevice.customer))
    res_dev = await db.execute(stmt_dev)
    all_devices = res_dev.scalars().all()

    # Mapeo de IP -> Dispositivo / Cliente
    ip_to_device: dict[str, CustomerDevice] = {}
    for dev in all_devices:
        if dev.ip_address:
            ip_to_device[dev.ip_address.strip()] = dev

    streaming_base = str(plex_config.streaming_url or plex_config.discovery_url).rstrip('/')
    token = plex_config.access_token

    sessions_output = []
    direct_play_count = 0
    transcode_count = 0
    total_bandwidth_kbps = 0

    for s in raw_sessions:
        if not isinstance(s, dict):
            continue

        player = s.get('Player', {}) or {}
        session_info = s.get('Session', {}) or {}
        transcode_info = s.get('TranscodeSession', {}) or {}
        media_list = s.get('Media', []) or []
        first_media = media_list[0] if media_list and isinstance(media_list[0], dict) else {}

        # Determinar IP del reproductor
        player_ip = (
            player.get('address')
            or player.get('remotePublicAddress')
            or session_info.get('location', '')
            or ''
        ).strip()

        # Cruce con base de datos de clientes
        matched_device = ip_to_device.get(player_ip)
        if matched_device and matched_device.customer:
            customer_name = matched_device.customer.name
            customer_id = matched_device.customer.id
            customer_token = matched_device.customer.uuid_token
            device_label = matched_device.device_name or player.get('device') or 'Dispositivo Stremio'
            is_identified = True
        else:
            customer_name = player.get('title') or player.get('product') or 'Cliente de Red'
            customer_id = None
            customer_token = None
            device_label = player.get('device') or player.get('platform') or 'Reproductor'
            is_identified = False

        # Formatear título del contenido
        media_type = s.get('type', 'video')
        if media_type == 'episode':
            grandparent = s.get('grandparentTitle', '')
            p_idx = s.get('parentIndex', 1)
            idx = s.get('index', 1)
            ep_title = s.get('title', '')
            full_title = f'{grandparent} - T{p_idx:02d}E{idx:02d} "{ep_title}"'
            subtitle = f'Temporada {p_idx}, Episodio {idx}'
        else:
            full_title = s.get('title', 'Película sin título')
            year = s.get('year', '')
            subtitle = f'Película ({year})' if year else 'Película'

        # Duración y Progreso
        duration_ms = int(s.get('duration', 0) or 0)
        view_offset_ms = int(s.get('viewOffset', 0) or 0)
        progress_pct = round((view_offset_ms / duration_ms) * 100, 1) if duration_ms > 0 else 0.0

        # Modo de Transmisión
        video_decision = transcode_info.get('videoDecision', '')
        if transcode_info and video_decision == 'transcode':
            stream_mode = 'TRANSCODE'
            transcode_count += 1
        elif transcode_info and video_decision == 'directstream':
            stream_mode = 'DIRECT_STREAM'
            direct_play_count += 1
        else:
            stream_mode = 'DIRECT_PLAY'
            direct_play_count += 1

        bandwidth = int(session_info.get('bandwidth', 0) or first_media.get('bitrate', 0) or 0)
        total_bandwidth_kbps += bandwidth

        # Miniaturas
        thumb_path = s.get('thumb') or s.get('parentThumb') or s.get('grandparentThumb')
        poster_url = f'{streaming_base}/{thumb_path.lstrip("/")}?X-Plex-Token={token}' if thumb_path else None

        art_path = s.get('art') or s.get('grandparentArt')
        art_url = f'{streaming_base}/{art_path.lstrip("/")}?X-Plex-Token={token}' if art_path else None

        sessions_output.append(
            {
                'session_key': str(s.get('sessionKey') or s.get('ratingKey') or id(s)),
                'rating_key': str(s.get('ratingKey', '')),
                'media_type': media_type,
                'title': full_title,
                'subtitle': subtitle,
                'year': s.get('year'),
                'poster_url': poster_url,
                'art_url': art_url,
                'state': str(player.get('state', 'playing')).lower(),
                'duration_ms': duration_ms,
                'view_offset_ms': view_offset_ms,
                'duration_formatted': format_time_ms(duration_ms),
                'view_offset_formatted': format_time_ms(view_offset_ms),
                'progress_percentage': min(100.0, max(0.0, progress_pct)),
                'player_name': player.get('title', 'Stremio'),
                'player_product': player.get('product', 'Stremio'),
                'player_device': player.get('device', 'Desconocido'),
                'player_platform': player.get('platform', ''),
                'player_ip': player_ip,
                'stream_mode': stream_mode,
                'video_resolution': first_media.get('videoResolution', ''),
                'video_codec': first_media.get('videoCodec', ''),
                'audio_codec': first_media.get('audioCodec', ''),
                'bitrate_kbps': bandwidth,
                'is_identified': is_identified,
                'customer_id': customer_id,
                'customer_name': customer_name,
                'customer_token': customer_token,
                'device_name': device_label,
            }
        )

    return {
        'configured': True,
        'server_name': plex_config.server_name,
        'stats': {
            'total_sessions': len(sessions_output),
            'direct_play_count': direct_play_count,
            'transcode_count': transcode_count,
            'total_bandwidth_kbps': total_bandwidth_kbps,
            'total_bandwidth_mbps': round(total_bandwidth_kbps / 1000, 2),
        },
        'sessions': sessions_output,
    }

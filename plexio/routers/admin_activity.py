import asyncio
import logging
import time
from typing import Annotated
from aiohttp import ClientSession
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from yarl import URL

from plexio.auth.security import get_current_admin
from plexio.db.database import get_db
from plexio.db.models import AdminUser, Customer, CustomerDevice, PlexServerConfig
from plexio.dependencies import get_http_client
from plexio.plex.media_server_api import get_active_plex_sessions, report_plex_timeline
from plexio.plex.session_tracker import find_matched_customer, get_active_playbacks

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api/admin/activity', tags=['Admin Live Activity'])


def normalize_ip(ip: str) -> str:
    """Normaliza direcciones IP para cruce confiable."""
    if not ip:
        return ''
    clean = ip.strip()
    if clean.startswith('::ffff:'):
        clean = clean[7:]
    if clean in ('::1', 'localhost'):
        return '127.0.0.1'
    return clean


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

    # 2. Sincronizar y mantener vivas las sesiones de reproducción activas de este API en Plex
    active_plays = get_active_playbacks()
    if active_plays and plex_config.discovery_url and plex_config.access_token:
        for ap in active_plays:
            now = time.time()
            elapsed_sec = int(now - ap.get('started_at', now))
            current_time_ms = elapsed_sec * 1000
            dur = ap.get('duration_ms', 0)
            if dur <= 0 or current_time_ms < dur:
                try:
                    await report_plex_timeline(
                        client=http,
                        url=URL(plex_config.discovery_url),
                        token=plex_config.access_token,
                        rating_key=ap['rating_key'],
                        state='playing',
                        time_ms=current_time_ms,
                        duration_ms=dur,
                        client_id=ap.get('client_id', ''),
                        device_name=ap.get('device_name', ''),
                    )
                except Exception as hb_err:
                    logger.debug('Error en heartbeat de Plex timeline: %s', hb_err)

    # 3. Consultar sesiones activas en Plex Media Server (/status/sessions)
    raw_sessions = await get_active_plex_sessions(
        client=http,
        url=URL(plex_config.discovery_url),
        token=plex_config.access_token,
    )

    # 4. Cargar clientes y dispositivos registrados para correlación inteligente
    stmt_c = select(Customer)
    res_c = await db.execute(stmt_c)
    all_customers = res_c.scalars().all()
    cust_by_id = {c.id: c for c in all_customers}

    stmt_dev = select(CustomerDevice).options(selectinload(CustomerDevice.customer))
    res_dev = await db.execute(stmt_dev)
    all_devices = res_dev.scalars().all()

    # Mapeo de IP normalizada -> Dispositivo / Cliente
    ip_to_device: dict[str, CustomerDevice] = {}
    for dev in all_devices:
        if dev.ip_address:
            norm = normalize_ip(dev.ip_address)
            if norm:
                ip_to_device[norm] = dev

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
        user_info = s.get('User', {}) or {}
        media_list = s.get('Media', []) or []
        first_media = media_list[0] if media_list and isinstance(media_list[0], dict) else {}

        # Determinar IP del reproductor y normalizar
        player_raw_ip = (
            player.get('address')
            or player.get('remotePublicAddress')
            or session_info.get('location', '')
            or ''
        ).strip()
        norm_ip = normalize_ip(player_raw_ip)

        player_machine_id = str(player.get('machineIdentifier', '') or '').strip()
        player_title = str(player.get('title', '') or '').strip()
        player_device_str = str(player.get('device', '') or '').strip()
        player_product_str = str(player.get('product', '') or '').strip()
        plex_user_title = str(user_info.get('title', '') or '').strip()

        rating_key = str(s.get('ratingKey', '') or '')
        parent_rating_key = str(s.get('parentRatingKey', '') or '')
        grandparent_rating_key = str(s.get('grandparentRatingKey', '') or '')
        item_key = str(s.get('key', '') or '')
        content_title = str(s.get('title', '') or '')

        matched_customer = None
        matched_device_label = None

        # Estrategia 1: Identificación precisa por machineIdentifier inyectado en Stremio por este API
        # Formato: stremio-c<customer_id>-<token_prefix>
        if 'stremio-c' in player_machine_id:
            try:
                sub = player_machine_id[player_machine_id.find('stremio-c') + 9:]
                cid_str = sub.split('-')[0]
                if cid_str.isdigit() and int(cid_str) in cust_by_id:
                    matched_customer = cust_by_id[int(cid_str)]
                    matched_device_label = player_title or player_device_str or 'Stremio'
            except Exception:
                pass

        # Estrategia 2: Identificación por session_tracker (solicitudes de stream despachadas por este API)
        if not matched_customer:
            tracked = find_matched_customer(
                rating_key=rating_key,
                parent_rating_key=parent_rating_key,
                grandparent_rating_key=grandparent_rating_key,
                key=item_key,
                title=content_title,
                player_ip=player_raw_ip,
                client_identifier=player_machine_id,
            )
            if tracked and tracked.get('customer_id') in cust_by_id:
                matched_customer = cust_by_id[tracked['customer_id']]
                matched_device_label = tracked.get('device_name') or player_title or 'Stremio'

        # Estrategia 3: Identificación por IP normalizada en base de datos de dispositivos de este API
        if not matched_customer and norm_ip:
            matched_dev = ip_to_device.get(norm_ip)
            if matched_dev and matched_dev.customer:
                matched_customer = matched_dev.customer
                matched_device_label = matched_dev.device_name or player_title or 'Stremio'

        # Estrategia 4: Identificación por coincidencia de nombre de cliente en título de reproductor o usuario
        if not matched_customer:
            candidates = [player_title.lower(), plex_user_title.lower(), player_device_str.lower()]
            for c in all_customers:
                c_name_lower = c.name.lower()
                if any(c_name_lower in cand for cand in candidates if cand):
                    matched_customer = c
                    matched_device_label = player_title or player_device_str or 'Stremio'
                    break

        # FILTRADO EXCLUSIVO: Solo mostrar lo que pasa por este API
        # Si la reproducción no pertenece a un cliente gestionado en este sistema, se ignora
        if not matched_customer:
            continue

        customer_name = matched_customer.name
        customer_id = matched_customer.id
        customer_token = matched_customer.uuid_token
        device_label = matched_device_label or player_device_str or 'Dispositivo Stremio'
        is_identified = True

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
            full_title = s.get('title', 'Película')
            year = s.get('year', '')
            subtitle = f'Película ({year})' if year else 'Película'

        # Duración y Progreso robusto
        first_part = first_media.get('Part', [{}])[0] if first_media.get('Part') else {}
        duration_ms = int(
            s.get('duration')
            or first_media.get('duration')
            or first_part.get('duration')
            or 0
        )
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
                'rating_key': rating_key,
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
                'player_name': player_title or player_product_str or 'Stremio',
                'player_product': player_product_str or 'Stremio',
                'player_device': player_device_str or 'Desconocido',
                'player_platform': player.get('platform', ''),
                'player_ip': player_raw_ip,
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

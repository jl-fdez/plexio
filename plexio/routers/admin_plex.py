import json
from datetime import datetime
from typing import Annotated
from aiohttp import ClientSession
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from yarl import URL

from plexio.auth.security import get_current_admin
from plexio.db.database import get_db
from plexio.db.models import AdminUser, PlexServerConfig
from plexio.dependencies import get_http_client
from plexio.plex.media_server_api import check_server_connection

router = APIRouter(prefix='/api/admin/plex', tags=['Admin Plex Config'])


class PlexConfigPayload(BaseModel):
    server_name: str
    access_token: str
    discovery_url: str
    streaming_url: str
    sections: list[dict]
    transcode_original: bool = False
    transcode_down: bool = False
    transcode_qualities: list[str] = []
    include_plex_tv: bool = False
    stream_mode: str = 'direct'  # 'direct' o 'hls'


class PlexConfigResponse(BaseModel):
    id: int
    server_name: str
    discovery_url: str
    streaming_url: str
    sections: list[dict]
    transcode_original: bool
    transcode_down: bool
    transcode_qualities: list[str]
    include_plex_tv: bool
    stream_mode: str = 'direct'
    updated_at: datetime


@router.get('/config')
async def get_plex_config(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PlexServerConfig).order_by(PlexServerConfig.id.asc())
    result = await db.execute(stmt)
    config = result.scalars().first()

    if not config:
        return {'configured': False, 'config': None}

    return {
        'configured': True,
        'config': {
            'id': config.id,
            'server_name': config.server_name,
            'discovery_url': config.discovery_url,
            'streaming_url': config.streaming_url,
            'sections': json.loads(config.sections_json or '[]'),
            'transcode_original': config.transcode_original,
            'transcode_down': config.transcode_down,
            'transcode_qualities': json.loads(config.transcode_qualities_json or '[]'),
            'include_plex_tv': config.include_plex_tv,
            'stream_mode': getattr(config, 'stream_mode', 'direct') or 'direct',
            'updated_at': config.updated_at,
        },
    }


def is_relay_url(url: str) -> bool:
    low = (url or '').lower()
    return 'relay.plex.services' in low or '-relay.' in low or '.plex.services' in low


@router.post('/config')
async def save_plex_config(
    payload: PlexConfigPayload,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PlexServerConfig).order_by(PlexServerConfig.id.asc())
    result = await db.execute(stmt)
    config = result.scalars().first()

    sections_str = json.dumps(payload.sections)
    qualities_str = json.dumps(payload.transcode_qualities)

    if config:
        config.server_name = payload.server_name
        config.access_token = payload.access_token
        config.discovery_url = payload.discovery_url
        config.streaming_url = payload.streaming_url
        config.sections_json = sections_str
        config.transcode_original = payload.transcode_original
        config.transcode_down = payload.transcode_down
        config.transcode_qualities_json = qualities_str
        config.include_plex_tv = payload.include_plex_tv
        config.stream_mode = payload.stream_mode
        config.updated_at = datetime.utcnow()
    else:
        config = PlexServerConfig(
            server_name=payload.server_name,
            access_token=payload.access_token,
            discovery_url=payload.discovery_url,
            streaming_url=payload.streaming_url,
            sections_json=sections_str,
            transcode_original=payload.transcode_original,
            transcode_down=payload.transcode_down,
            transcode_qualities_json=qualities_str,
            include_plex_tv=payload.include_plex_tv,
            stream_mode=payload.stream_mode,
        )
        db.add(config)

    await db.flush()
    await db.refresh(config)

    warning = None
    if is_relay_url(payload.streaming_url) or is_relay_url(payload.discovery_url):
        warning = (
            'Aviso importante: Has configurado una URL de Plex Relay. '
            'Plex Relay solo admite un único stream a la vez y saturará el túnel, '
            'haciendo que tu servidor aparezca desconectado en tu app oficial de Plex. '
            'Se recomienda encarecidamente usar una conexión directa con puerto 32400.'
        )

    return {
        'success': True,
        'message': 'Configuración de Plex guardada correctamente.',
        'warning': warning,
    }


@router.delete('/config')
async def delete_plex_config(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PlexServerConfig)
    result = await db.execute(stmt)
    configs = result.scalars().all()
    for c in configs:
        await db.delete(c)
    return {'success': True, 'message': 'Configuración eliminada.'}


@router.get('/test-connection')
async def test_admin_connection(
    url: str,
    token: str,
    http: Annotated[ClientSession, Depends(get_http_client)],
    admin: AdminUser = Depends(get_current_admin),
):
    success = await check_server_connection(
        client=http,
        url=URL(url),
        token=token,
    )
    return {
        'success': success,
        'is_relay': is_relay_url(url),
    }

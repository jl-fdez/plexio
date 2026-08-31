import json
from datetime import datetime
from itertools import chain
from typing import Annotated
from aiohttp import ClientSession
from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.asyncio.client import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from yarl import URL

from plexio import __version__
from plexio.auth.devices import check_and_register_device
from plexio.db.database import get_db
from plexio.db.models import Customer, PlexServerConfig
from plexio.dependencies import get_cache, get_http_client
from plexio.models import PLEX_TO_STREMIO_MEDIA_TYPE, STREMIO_TO_PLEX_MEDIA_TYPE
from plexio.models.addon import AddonConfiguration
from plexio.models.plex import PlexLibrarySection, Resolution
from plexio.models.stremio import (
    StremioCatalog,
    StremioCatalogManifest,
    StremioManifest,
    StremioMediaType,
    StremioMetaResponse,
    StremioStreamsResponse,
)
from plexio.models.utils import plexio_id_to_guid
from plexio.plex.media_server_api import (
    SORT_OPTIONS,
    get_all_episodes,
    get_media,
    get_section_media,
    stremio_to_plex_id,
)

router = APIRouter(prefix='/u/{customer_token}', tags=['Customer Stremio Addon'])


async def get_valid_customer_and_config(
    customer_token: str,
    db: AsyncSession,
) -> tuple[Customer, PlexServerConfig | None, bool]:
    """
    Retorna (customer, plex_config, is_active_and_valid)
    """
    stmt_c = select(Customer).where(Customer.uuid_token == customer_token)
    res_c = await db.execute(stmt_c)
    customer = res_c.scalar_one_or_none()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Cliente o token no encontrado',
        )

    now = datetime.utcnow()
    is_valid = customer.status == 'ACTIVE' and customer.expiration_date >= now

    stmt_cfg = select(PlexServerConfig).order_by(PlexServerConfig.id.asc())
    res_cfg = await db.execute(stmt_cfg)
    plex_config = res_cfg.scalars().first()

    return customer, plex_config, is_valid


def build_addon_configuration(plex_config: PlexServerConfig) -> AddonConfiguration:
    sections_raw = json.loads(plex_config.sections_json or '[]')
    sections = [
        PlexLibrarySection(
            key=s['key'],
            title=s['title'],
            type=s['type'],
        )
        for s in sections_raw
    ]

    qualities_raw = json.loads(plex_config.transcode_qualities_json or '[]')
    qualities = [Resolution(q) for q in qualities_raw if q in Resolution._value2member_map_]

    return AddonConfiguration(
        server_name=plex_config.server_name,
        access_token=plex_config.access_token,
        discovery_url=URL(plex_config.discovery_url),
        streaming_url=URL(plex_config.streaming_url),
        sections=sections,
        include_transcode_original=plex_config.transcode_original,
        include_transcode_down=plex_config.transcode_down,
        transcode_down_qualities=qualities,
        include_plex_tv=plex_config.include_plex_tv,
    )


@router.get('/manifest.json', response_model_exclude_none=True)
async def get_customer_manifest(
    customer_token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StremioManifest:
    customer, plex_config, is_valid = await get_valid_customer_and_config(customer_token, db)

    if not is_valid:
        exp_date_str = customer.expiration_date.strftime('%Y-%m-%d')
        return StremioManifest(
            id='com.stremio.plexio.customer',
            version=__version__,
            description=f'Tu suscripción ({customer.name}) ha expirado el {exp_date_str}. Contacta al administrador para renovar.',
            name=f'PX Central (Suscripción Vencida - {customer.name})',
            resources=['stream'],
            types=[StremioMediaType.movie, StremioMediaType.series],
            catalogs=[],
            idPrefixes=['tt', 'plexio'],
            behaviorHints={'configurable': False, 'configurationRequired': False},
        )

    # Validar límite de dispositivos
    device_allowed, device_info = await check_and_register_device(customer, request, db)
    if not device_allowed:
        return StremioManifest(
            id='com.stremio.plexio.customer',
            version=__version__,
            description=f'¡Límite de Dispositivos Excedido! Tu cuenta de {customer.name} sólo permite {customer.max_devices} dispositivo(s). {device_info}',
            name='PX Central (Límite Dispositivos Superado)',
            resources=['stream'],
            types=[StremioMediaType.movie, StremioMediaType.series],
            catalogs=[],
            idPrefixes=['tt', 'plexio'],
            behaviorHints={'configurable': False, 'configurationRequired': False},
        )

    if not plex_config:
        return StremioManifest(
            id='com.stremio.plexio.customer',
            version=__version__,
            description='Servidor en mantenimiento o no configurado por el administrador.',
            name='PX Central (Mantenimiento)',
            resources=['stream'],
            types=[StremioMediaType.movie, StremioMediaType.series],
            catalogs=[],
            idPrefixes=['tt', 'plexio'],
            behaviorHints={'configurable': False, 'configurationRequired': False},
        )

    config = build_addon_configuration(plex_config)
    catalogs = []
    for section in config.sections:
        catalogs.append(
            StremioCatalogManifest(
                id=section.key,
                type=PLEX_TO_STREMIO_MEDIA_TYPE[section.type],
                name=f'{section.title} | {config.server_name}',
                extra=[
                    {'name': 'skip', 'isRequired': False},
                    {'name': 'search', 'isRequired': False},
                    {'name': 'sort', 'options': list(SORT_OPTIONS.keys())},
                ],
            ),
        )

    exp_date_str = customer.expiration_date.strftime('%Y-%m-%d')
    return StremioManifest(
        id='com.stremio.plexio.customer',
        version=__version__,
        description=f'PX Central - Suscripción activa de {customer.name} (Válido hasta: {exp_date_str} • Max {customer.max_devices} Disp.)',
        name=f'PX Central ({config.server_name})',
        resources=[
            'stream',
            'catalog',
            {
                'name': 'meta',
                'types': ['movie', 'series'],
                'idPrefixes': ['plexio'],
            },
        ],
        types=[StremioMediaType.movie, StremioMediaType.series],
        catalogs=catalogs,
        idPrefixes=['tt', 'plexio'],
        behaviorHints={'configurable': False, 'configurationRequired': False},
    )


@router.get(
    '/catalog/{stremio_type}/{catalog_id}.json',
    response_model_exclude_none=True,
)
@router.get(
    '/catalog/{stremio_type}/{catalog_id}/{extra}.json',
    response_model_exclude_none=True,
)
async def get_customer_catalog(
    customer_token: str,
    stremio_type: StremioMediaType,
    catalog_id: str,
    request: Request,
    http: Annotated[ClientSession, Depends(get_http_client)],
    extra: str = '',
    db: AsyncSession = Depends(get_db),
) -> StremioCatalog:
    customer, plex_config, is_valid = await get_valid_customer_and_config(customer_token, db)
    if not is_valid or not plex_config:
        return StremioCatalog(metas=[])

    device_allowed, _ = await check_and_register_device(customer, request, db)
    if not device_allowed:
        return StremioCatalog(metas=[])

    config = build_addon_configuration(plex_config)
    extras = dict(e.split('=') for e in extra.split('&') if e)

    media = await get_section_media(
        client=http,
        url=config.discovery_url,
        token=config.access_token,
        section_id=catalog_id,
        search=extras.get('search', ''),
        skip=extras.get('skip', 0),
        sort=extras.get('sort', 'Title'),
    )
    return StremioCatalog(
        metas=[m.to_stremio_meta_review(config) for m in media],
    )


@router.get(
    '/meta/{stremio_type}/{plex_id:path}.json',
    response_model_exclude_none=True,
)
async def get_customer_meta(
    customer_token: str,
    stremio_type: StremioMediaType,
    plex_id: str,
    request: Request,
    http: Annotated[ClientSession, Depends(get_http_client)],
    db: AsyncSession = Depends(get_db),
) -> StremioMetaResponse:
    customer, plex_config, is_valid = await get_valid_customer_and_config(customer_token, db)
    if not is_valid or not plex_config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    device_allowed, _ = await check_and_register_device(customer, request, db)
    if not device_allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Límite de dispositivos excedido')

    if not plex_id.startswith('plexio:'):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    config = build_addon_configuration(plex_config)
    guid = plexio_id_to_guid(plex_id)
    media = await get_media(
        client=http,
        url=config.discovery_url,
        token=config.access_token,
        guid=guid,
        get_only_first=True,
    )
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    media_item = media[0]
    meta = media_item.to_stremio_meta(config)

    if stremio_type == StremioMediaType.series:
        episodes = await get_all_episodes(
            client=http,
            url=config.discovery_url,
            token=config.access_token,
            key=media_item.key,
        )
        meta.videos = [e.to_stremio_video_meta(config) for e in episodes]

    return StremioMetaResponse(meta=meta)


@router.get(
    '/stream/{stremio_type}/{media_id:path}.json',
    response_model_exclude_none=True,
)
async def get_customer_stream(
    customer_token: str,
    stremio_type: StremioMediaType,
    media_id: str,
    request: Request,
    http: Annotated[ClientSession, Depends(get_http_client)],
    cache: Annotated[Redis, Depends(get_cache)],
    db: AsyncSession = Depends(get_db),
) -> StremioStreamsResponse:
    customer, plex_config, is_valid = await get_valid_customer_and_config(customer_token, db)

    # BLOQUEO AUTOMÁTICO SI LA SUSCRIPCIÓN EXPIRÓ O ESTÁ SUSPENDIDA
    if not is_valid or not plex_config:
        return StremioStreamsResponse(streams=[])

    # BLOQUEO AUTOMÁTICO SI EXCEDIO EL LÍMITE DE DISPOSITIVOS
    device_allowed, _ = await check_and_register_device(customer, request, db)
    if not device_allowed:
        return StremioStreamsResponse(streams=[])

    config = build_addon_configuration(plex_config)

    if media_id.startswith('tt'):
        plex_id = await stremio_to_plex_id(
            client=http,
            url=config.discovery_url,
            token=config.access_token,
            cache=cache,
            stremio_id=media_id,
            media_type=STREMIO_TO_PLEX_MEDIA_TYPE[stremio_type],
        )
        if not plex_id:
            return StremioStreamsResponse()
    elif media_id.startswith('plexio:'):
        plex_id = plexio_id_to_guid(media_id)
    else:
        plex_id = media_id

    media = await get_media(
        client=http,
        url=config.discovery_url,
        token=config.access_token,
        guid=plex_id,
    )
    return StremioStreamsResponse(
        streams=chain.from_iterable(
            m.get_stremio_streams(config) for m in media
        ),
    )

import json
import logging
from datetime import datetime
from itertools import chain
from typing import Annotated
from aiohttp import ClientSession
from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.asyncio.client import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from yarl import URL

logger = logging.getLogger(__name__)

from plexio import __version__
from plexio.auth.devices import check_and_register_device, get_client_ip
from plexio.db.database import get_db
from plexio.db.models import Customer, PlexServerConfig
from plexio.dependencies import get_cache, get_http_client
from plexio.models import PLEX_TO_STREMIO_MEDIA_TYPE, STREMIO_TO_PLEX_MEDIA_TYPE
from plexio.models.addon import AddonConfiguration
from plexio.models.plex import PlexLibrarySection, PlexMediaType, Resolution
from plexio.plex.session_tracker import record_stream_activity
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


def parse_expiration_date(exp) -> datetime:
    if isinstance(exp, datetime):
        return exp
    if isinstance(exp, str):
        try:
            return datetime.fromisoformat(exp.replace('Z', '+00:00')).replace(tzinfo=None)
        except Exception:
            return datetime.utcnow()
    return datetime.utcnow()


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

    exp_date = parse_expiration_date(customer.expiration_date)
    is_expired = (exp_date < datetime.utcnow())
    is_valid = (customer.status == 'ACTIVE') and not is_expired

    stmt_cfg = select(PlexServerConfig).order_by(PlexServerConfig.id.desc())
    res_cfg = await db.execute(stmt_cfg)
    plex_config = res_cfg.scalars().first()

    return customer, plex_config, is_valid


def build_addon_configuration(plex_config: PlexServerConfig | None) -> AddonConfiguration:
    def safe_url(url_str: str | None) -> URL:
        try:
            if url_str and url_str.strip():
                return URL(url_str.strip())
        except Exception:
            pass
        return URL('http://localhost:32400')

    if not plex_config:
        return AddonConfiguration(
            server_name='Plex Server',
            access_token='',
            discovery_url=URL('http://localhost:32400'),
            streaming_url=URL('http://localhost:32400'),
            sections=[],
            include_transcode_original=False,
            include_transcode_down=False,
            transcode_down_qualities=[],
            include_plex_tv=False,
        )

    try:
        sections_raw = json.loads(plex_config.sections_json or '[]')
    except Exception:
        sections_raw = []

    sections = []
    for s in sections_raw:
        try:
            sec_type_str = str(s.get('type', '')).strip().lower()
            sec_type = PlexMediaType.movie if sec_type_str == 'movie' else (PlexMediaType.show if sec_type_str == 'show' else sec_type_str)
            sections.append(
                PlexLibrarySection(
                    key=str(s.get('key', '')),
                    title=str(s.get('title', 'Biblioteca')),
                    type=sec_type,
                )
            )
        except Exception as err:
            logger.error('Error parseando seccion Plex %s: %s', s, err)

    try:
        qualities_raw = json.loads(plex_config.transcode_qualities_json or '[]')
        qualities = [Resolution(q) for q in qualities_raw if q in Resolution._value2member_map_]
    except Exception:
        qualities = []

    return AddonConfiguration(
        server_name=plex_config.server_name or 'Plex Server',
        access_token=plex_config.access_token or '',
        discovery_url=safe_url(plex_config.discovery_url),
        streaming_url=safe_url(plex_config.streaming_url),
        sections=sections,
        include_transcode_original=bool(plex_config.transcode_original),
        include_transcode_down=bool(plex_config.transcode_down),
        transcode_down_qualities=qualities,
        include_plex_tv=bool(plex_config.include_plex_tv),
    )


@router.get('/debug-manifest')
async def debug_customer_manifest(
    customer_token: str,
    db: AsyncSession = Depends(get_db),
):
    customer, plex_config, is_valid = await get_valid_customer_and_config(customer_token, db)
    if not plex_config:
        return {'status': 'no_plex_config', 'customer': customer.name}

    config = build_addon_configuration(plex_config)
    catalogs = []
    for section in config.sections:
        sec_type_str = str(section.type).lower()
        if 'show' in sec_type_str or 'series' in sec_type_str:
            media_type = StremioMediaType.series
        else:
            media_type = StremioMediaType.movie

        catalogs.append(
            StremioCatalogManifest(
                id=str(section.key),
                type=media_type,
                name=section.title,
                extra=[
                    {'name': 'skip', 'isRequired': False},
                    {'name': 'search', 'isRequired': False},
                    {'name': 'sort', 'options': list(SORT_OPTIONS.keys())},
                ],
            )
        )

    return {
        'customer_name': customer.name,
        'customer_status': customer.status,
        'plex_config_id': plex_config.id,
        'plex_config_server_name': plex_config.server_name,
        'raw_sections_json': plex_config.sections_json,
        'parsed_sections_count': len(config.sections),
        'parsed_sections': [s.model_dump() for s in config.sections],
        'catalogs_count': len(catalogs),
        'catalogs': [c.model_dump() for c in catalogs],
    }


@router.get('/manifest.json', response_model_exclude_none=True)
async def get_customer_manifest(
    customer_token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> StremioManifest:
    try:
        customer, plex_config, is_valid = await get_valid_customer_and_config(customer_token, db)
        exp_date = parse_expiration_date(customer.expiration_date)
        exp_date_str = exp_date.strftime('%Y-%m-%d')

        # Resolver URL pública del logo respetando proxies inversos
        host = request.headers.get('x-forwarded-host') or request.headers.get('host') or request.url.netloc
        proto = request.headers.get('x-forwarded-proto') or request.url.scheme
        logo_url = f"{proto}://{host}/logo.png" if host else f"{str(request.base_url).rstrip('/')}/logo.png"

        if not is_valid:
            is_expired = (exp_date < datetime.utcnow())
            status_msg = f'La suscripción de {customer.name} venció el {exp_date_str}. Contacta al administrador para renovar.' if is_expired else f'El acceso para {customer.name} se encuentra pausado o suspendido. Contacta al administrador para habilitar tu servicio.'
            status_title = f'PX Central (Vencido - {customer.name})' if is_expired else f'PX Central (Acceso Suspendido - {customer.name})'
            return StremioManifest(
                id='com.stremio.plexio.customer',
                version=__version__,
                description=status_msg,
                name=status_title,
                logo=logo_url,
                icon=logo_url,
                resources=['stream'],
                types=[StremioMediaType.movie, StremioMediaType.series],
                catalogs=[],
                idPrefixes=['tt', 'plexio'],
                behaviorHints={'configurable': False, 'configurationRequired': False},
                contactEmail='support@plexio.stream',
            )

        # Validar límite de dispositivos
        try:
            device_allowed, device_info = await check_and_register_device(customer, request, db)
            if not device_allowed:
                return StremioManifest(
                    id='com.stremio.plexio.customer',
                    version=__version__,
                    description=f'¡Límite de Dispositivos Excedido! Tu cuenta de {customer.name} sólo permite {customer.max_devices} dispositivo(s). {device_info}',
                    name='PX Central (Límite Dispositivos Superado)',
                    logo=logo_url,
                    icon=logo_url,
                    resources=['stream'],
                    types=[StremioMediaType.movie, StremioMediaType.series],
                    catalogs=[],
                    idPrefixes=['tt', 'plexio'],
                    behaviorHints={'configurable': False, 'configurationRequired': False},
                    contactEmail='support@plexio.stream',
                )
        except Exception as dev_err:
            logger.exception('Error validando dispositivo: %s', dev_err)

        if not plex_config:
            return StremioManifest(
                id='com.stremio.plexio.customer',
                version=__version__,
                description='Servidor en mantenimiento o no configurado por el administrador.',
                name='PX Central (Mantenimiento)',
                logo=logo_url,
                icon=logo_url,
                resources=['stream'],
                types=[StremioMediaType.movie, StremioMediaType.series],
                catalogs=[],
                idPrefixes=['tt', 'plexio'],
                behaviorHints={'configurable': False, 'configurationRequired': False},
                contactEmail='support@plexio.stream',
            )

        config = build_addon_configuration(plex_config)
        catalogs = []
        for section in config.sections:
            sec_type_str = str(section.type).lower()
            if 'show' in sec_type_str or 'series' in sec_type_str:
                media_type = StremioMediaType.series
            else:
                media_type = StremioMediaType.movie

            catalogs.append(
                StremioCatalogManifest(
                    id=str(section.key),
                    type=media_type,
                    name=section.title,
                    extra=[
                        {'name': 'skip', 'isRequired': False},
                        {'name': 'search', 'isRequired': False},
                        {'name': 'sort', 'options': list(SORT_OPTIONS.keys())},
                    ],
                ),
            )

        return StremioManifest(
            id='com.stremio.plexio.customer',
            version=__version__,
            description=f'PX Central - Suscripción activa de {customer.name} (Max {customer.max_devices} Disp.)',
            name='PX Central',
            logo=logo_url,
            icon=logo_url,
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
            contactEmail='support@plexio.stream',
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception('Error en get_customer_manifest: %s', exc)
        return StremioManifest(
            id='com.stremio.plexio.customer',
            version=__version__,
            description=f'Detalle de error: {type(exc).__name__} - {str(exc)}',
            name='PX Central (Diagnóstico)',
            logo=f"{str(request.base_url).rstrip('/')}/logo.png",
            icon=f"{str(request.base_url).rstrip('/')}/logo.png",
            resources=['stream'],
            types=[StremioMediaType.movie, StremioMediaType.series],
            catalogs=[],
            idPrefixes=['tt', 'plexio'],
            behaviorHints={'configurable': False, 'configurationRequired': False},
            contactEmail='support@plexio.stream',
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
    try:
        customer, plex_config, is_valid = await get_valid_customer_and_config(customer_token, db)
        if not is_valid or not plex_config:
            return StremioCatalog(metas=[])

        device_allowed, _ = await check_and_register_device(customer, request, db)
        if not device_allowed:
            return StremioCatalog(metas=[])

        config = build_addon_configuration(plex_config)
        extras = {}
        if extra:
            for item in extra.split('&'):
                if '=' in item:
                    k, v = item.split('=', 1)
                    extras[k] = v

        media = await get_section_media(
            client=http,
            url=config.discovery_url,
            token=config.access_token,
            section_id=catalog_id,
            search=extras.get('search', ''),
            skip=extras.get('skip', 0),
            sort=extras.get('sort', 'Date Added (desc)'),
        )
        return StremioCatalog(
            metas=[m.to_stremio_meta_review(config) for m in media],
        )
    except Exception as exc:
        logger.exception('Error en get_customer_catalog: %s', exc)
        return StremioCatalog(metas=[])


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
    try:
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
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception('Error en get_customer_meta: %s', exc)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


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
    try:
        customer, plex_config, is_valid = await get_valid_customer_and_config(customer_token, db)

        # BLOQUEO AUTOMÁTICO SI LA SUSCRIPCIÓN ESTÁ SUSPENDIDA
        if not is_valid or not plex_config:
            return StremioStreamsResponse(streams=[])

        # BLOQUEO AUTOMÁTICO SI EXCEDIO EL LÍMITE DE DISPOSITIVOS
        device_allowed, device_info = await check_and_register_device(customer, request, db)
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
                return StremioStreamsResponse(streams=[])
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

        # Registrar actividad en session_tracker para emparejamiento inteligente de sesiones en vivo
        try:
            client_ip = get_client_ip(request)
            rk_list = [str(getattr(m, 'rating_key', '')) for m in media if getattr(m, 'rating_key', None)]
            k_list = [str(getattr(m, 'key', '')) for m in media if getattr(m, 'key', None)]
            t_list = [str(getattr(m, 'title', '')) for m in media if getattr(m, 'title', None)]
            record_stream_activity(
                customer_id=customer.id,
                customer_name=customer.name,
                customer_token=customer.uuid_token,
                device_name=device_info,
                ip_address=client_ip,
                rating_keys=rk_list,
                keys=k_list,
                titles=t_list,
            )
        except Exception as track_err:
            logger.error('Error registrando actividad de stream en session_tracker: %s', track_err)

        return StremioStreamsResponse(
            streams=chain.from_iterable(
                m.get_stremio_streams(config, customer=customer, device_name=device_info) for m in media
            ),
        )
    except Exception as exc:
        logger.exception('Error en get_customer_stream: %s', exc)
        return StremioStreamsResponse(streams=[])

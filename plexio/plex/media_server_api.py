from http import HTTPStatus

from aiohttp import ClientConnectorError, ClientSession
from yarl import URL

from plexio.models.plex import (
    PlexEpisodeMeta,
    PlexMediaMeta,
    PlexMediaType,
)
from plexio.plex.utils import get_json
from plexio.settings import settings

SORT_OPTIONS = {
    'Date Added (desc)': 'addedAt:desc',
    'Date Added': 'addedAt',
    'Release Date (desc)': 'originallyAvailableAt:desc',
    'Release Date': 'originallyAvailableAt',
    'Title': 'title',
    'Title (desc)': 'title:desc',
    'Year (desc)': 'year:desc',
    'Year': 'year',
    'Critic Rating (desc)': 'rating:desc',
    'Critic Rating': 'rating',
    'Audience Rating (desc)': 'audienceRating:desc',
    'Audience Rating': 'audienceRating',
    'Rating (desc)': 'userRating:desc',
    'Rating': 'userRating',
    'Content Rating (desc)': 'contentRating:desc',
    'Content Rating': 'contentRating',
    'Duration (desc)': 'duration:desc',
    'Duration': 'duration',
    'Progress (desc)': 'viewOffset:desc',
    'Progress': 'viewOffset',
    'Plays (desc)': 'viewCount:desc',
    'Plays': 'viewCount',
    'Date Viewed (desc)': 'lastViewedAt:desc',
    'Date Viewed': 'lastViewedAt',
    'ResolutionSelected (desc)': 'mediaHeight:desc',
    'ResolutionSelected': 'mediaHeight',
    'Bitrate (desc)': 'mediaBitrate:desc',
    'Bitrate': 'mediaBitrate',
    'Randomly': 'random',
}


async def check_server_connection(
    *,
    client: ClientSession,
    url: URL,
    token: str,
) -> bool:
    try:
        async with client.get(
            url,
            params={
                'X-Plex-Token': token,
            },
            timeout=settings.plex_requests_timeout,
        ) as response:
            if response.status != HTTPStatus.OK:
                return False
            return True
    except (TimeoutError, ClientConnectorError):
        return False


async def get_section_media(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    section_id: str,
    skip: int,
    search: str,
    sort: str,
) -> list[PlexMediaMeta]:
    params = {
        'includeGuids': 1,
        'X-Plex-Container-Start': skip,
        'X-Plex-Container-Size': 100,
        'X-Plex-Token': token,
    }
    if search:
        params['title'] = search
    if sort:
        params['sort'] = SORT_OPTIONS.get(sort, sort)
    json = await get_json(
        client=client,
        url=url / 'library/sections' / section_id / 'all',
        params=params,
    )
    metadata = json.get('MediaContainer', {}).get('Metadata', []) if isinstance(json, dict) else []
    return [PlexMediaMeta(**meta) for meta in metadata]


async def get_media(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    guid: str,
    get_only_first=False,
) -> list[PlexMediaMeta]:
    json = await get_json(
        client=client,
        url=url / 'library/all',
        params={
            'guid': guid,
            'X-Plex-Token': token,
        },
    )
    media_sections = json.get('MediaContainer', {}).get('Metadata', []) if isinstance(json, dict) else []
    media_metas = []
    for section in media_sections:
        if section.get('type') not in ('show', 'movie', 'episode') or not section.get('ratingKey'):
            continue
        json = await get_json(
            client=client,
            url=url / 'library/metadata' / str(section['ratingKey']),
            params={
                'X-Plex-Token': token,
                'includeElements': 'Stream',
            },
        )
        meta_list = json.get('MediaContainer', {}).get('Metadata', []) if isinstance(json, dict) else []
        if not meta_list:
            continue
        metadata = meta_list[0]
        media_metas.append(PlexMediaMeta(**metadata))
        if get_only_first:
            break
    return media_metas


async def get_all_episodes(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    key: str,
) -> list[PlexEpisodeMeta]:
    leaf_key = key.lstrip('/')
    json = await get_json(
        client=client,
        url=str(url / leaf_key).replace('/children', '/allLeaves'),
        params={
            'X-Plex-Token': token,
        },
    )
    metadata = json.get('MediaContainer', {}).get('Metadata', []) if isinstance(json, dict) else []
    episodes = []
    for i, meta in enumerate(metadata):
        meta.setdefault('index', i)
        episodes.append(PlexEpisodeMeta(**meta))
    return episodes


async def imdb_to_plex_id(
    *,
    client: ClientSession,
    imdb_id: str,
    media_type: PlexMediaType,
    token: str,
) -> str | None:
    json = await get_json(
        client=client,
        url='https://metadata.provider.plex.tv/library/metadata/matches',
        params={
            'X-Plex-Token': settings.plex_matching_token or token,
            'type': 1 if media_type is PlexMediaType.movie else 2,
            'title': f'imdb-{imdb_id}',
            'guid': f'com.plexapp.agents.imdb://{imdb_id}?lang=en',
        },
    )
    if isinstance(json, dict):
        media_container = json.get('MediaContainer', {})
        metadata = media_container.get('Metadata', [])
        if metadata and len(metadata) > 0:
            return metadata[0].get('guid')
    return None


async def get_episode_guid(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    show_guid: str,
    season: str,
    episode: str,
) -> str:
    all_episodes = await get_all_episodes(
        client=client,
        url=url,
        token=token,
        key=show_guid,
    )
    for metadata in all_episodes:
        if str(metadata.parent_index) == season and str(metadata.index) == episode:
            return metadata.guid


async def stremio_to_plex_id(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    cache,
    stremio_id: str,
    media_type: PlexMediaType,
) -> str | None:
    if cached_plex_id := await cache.get(stremio_id):
        return cached_plex_id

    if media_type == PlexMediaType.show:
        id_season_episode = stremio_id.split(':')
        if len(id_season_episode) != 3:
            return None
        imdb_id, season, episode = id_season_episode
    else:
        imdb_id = stremio_id

    plex_id = await imdb_to_plex_id(
        client=client,
        imdb_id=imdb_id,
        media_type=media_type,
        token=token,
    )
    if not plex_id:
        return None

    if media_type == PlexMediaType.show:
        media = await get_media(
            client=client,
            url=url,
            token=token,
            guid=plex_id,
        )
        for meta in media:
            plex_id = await get_episode_guid(
                client=client,
                url=url,
                token=token,
                show_guid=meta.key,
                season=season,
                episode=episode,
            )
            if plex_id:
                break
        else:
            return None

    if plex_id:
        await cache.set(stremio_id, plex_id)
    return plex_id


async def get_active_plex_sessions(
    *,
    client: ClientSession,
    url: URL,
    token: str,
) -> list[dict]:
    """
    Obtiene las sesiones de reproducción activas de Plex Media Server (/status/sessions).
    """
    try:
        json = await get_json(
            client=client,
            url=url / 'status/sessions',
            params={
                'X-Plex-Token': token,
            },
        )
        if not isinstance(json, dict):
            return []
        media_container = json.get('MediaContainer', {})
        metadata = media_container.get('Metadata', [])
        return metadata if isinstance(metadata, list) else []
    except Exception:
        return []

import os
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from plexio.models.utils import get_flag_emoji, guid_to_plexio_id, to_camel


class Resolution(str, Enum):
    R480 = '480p'
    R720 = '720p'
    R1080 = '1080p'


RESOLUTION_QUALITY_PARAMS = {
    Resolution.R1080: {
        'name': '1080p',
        'min_width': 1920,
        'plex_args': {
            'videoQuality': 100,
            'maxVideoBitrate': 10,
            'videoResolution': '1920x1080',
        },
    },
    Resolution.R720: {
        'name': '720p',
        'min_width': 1280,
        'plex_args': {
            'videoQuality': 100,
            'maxVideoBitrate': 6.5,
            'videoResolution': '1280x720',
        },
    },
    Resolution.R480: {
        'name': '480p',
        'min_width': 640,
        'plex_args': {
            'videoQuality': 100,
            'maxVideoBitrate': 3.5,
            'videoResolution': '640×480',
        },
    },
}


class PlexMediaType(str, Enum):
    show = 'show'
    movie = 'movie'
    episode = 'episode'


class PlexLibrarySection(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )

    key: str
    title: str
    type: PlexMediaType | str


def format_stream_resolution_name(video_resolution: str | None, width: int = 0) -> str:
    res = str(video_resolution or '').lower().strip()
    if '2160' in res or '4k' in res or 'uhd' in res or width >= 3840:
        return '🖥️ UHD'
    elif '1440' in res or '2k' in res or 'qhd' in res or width >= 2560:
        return '🖥️ QHD'
    elif '1080' in res or 'fhd' in res or width >= 1920:
        return '🖥️ FHD'
    elif '720' in res or 'hd' in res or width >= 1280:
        return '🖥️ HD'
    elif '576' in res or width >= 720:
        return '🖥️ SD'
    elif '480' in res or 'sd' in res or (0 < width <= 720):
        return '🖥️ SD'
    return '🖥️ ?'


def format_file_size_bytes(size_bytes: int | float | None) -> str:
    if not size_bytes or size_bytes <= 0:
        return ''
    gb = size_bytes / (1024 ** 3)
    if gb >= 1.0:
        return f'{gb:.1f} GB'
    mb = size_bytes / (1024 ** 2)
    return f'{mb:.0f} MB'


class PlexMediaMeta(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    guid: str
    type: PlexMediaType
    title: str
    added_at: int = 0

    rating_key: str | None = None
    key: str | None = None
    studio: str | None = None
    title_sort: str | None = None
    library_section_title: str | None = None
    library_sectionID: str | None = None
    library_section_key: str | None = None
    content_rating: str | None = None
    summary: str = ''
    rating: float | None = None
    audience_rating: float | None = None
    year: int | None = None
    index: int | None = None
    parent_index: int | None = None
    tagline: str | None = None
    thumb: str | None = None
    art: str | None = None
    duration: int | None = None
    originally_available_at: str | None = None
    updated_at: int | None = None
    audience_rating_image: str | None = None
    has_premium_primary_extra: str | None = None
    rating_image: str | None = None
    media: list = Field(alias='Media', default_factory=list)
    genre: list = Field(alias='Genre', default_factory=list)
    country: list = Field(alias='Country', default_factory=list)
    guids: list = Field(alias='Guid', default_factory=list)
    ratings: list = Field(alias='Ratings', default_factory=list)
    director: list = Field(alias='Director', default_factory=list)
    writer: list = Field(alias='Writer', default_factory=list)
    role: list = Field(alias='Role', default_factory=list)
    producer: list = Field(alias='Producer', default_factory=list)

    def get_year(self):
        if self.year:
            return str(self.year)
        return datetime.fromtimestamp(self.added_at).strftime('%Y')

    def to_stremio_meta(self, configuration):
        from plexio.models import PLEX_TO_STREMIO_MEDIA_TYPE
        from plexio.models.stremio import StremioMeta

        return StremioMeta(
            id=guid_to_plexio_id(self.guid),
            type=PLEX_TO_STREMIO_MEDIA_TYPE[self.type],
            name=self.title,
            releaseInfo=self.get_year(),
            imdbRating=self.audience_rating,
            description=self.summary,
            poster=str(
                configuration.streaming_url
                / self.thumb.lstrip('/')
                % {'X-Plex-Token': configuration.access_token},
            )
            if self.thumb
            else None,
            background=str(
                configuration.streaming_url
                / (self.art or self.thumb).lstrip('/')
                % {'X-Plex-Token': configuration.access_token},
            )
            if (self.art or self.thumb)
            else None,
            genres=[g['tag'] for g in self.genre if isinstance(g, dict) and 'tag' in g],
        )

    def to_stremio_meta_review(self, configuration):
        from plexio.models import PLEX_TO_STREMIO_MEDIA_TYPE
        from plexio.models.stremio import StremioMetaPreview

        stremio_id = None
        guids = self.guids or []
        for guid in guids:
            if isinstance(guid, dict) and guid.get('id', '').startswith('imdb://'):
                stremio_id = guid['id'][7:]

        if not stremio_id:
            if '://' in self.guid:
                stremio_id = guid_to_plexio_id(self.guid)
            else:
                stremio_id = self.guid

        return StremioMetaPreview(
            id=stremio_id,
            name=self.title,
            releaseInfo=str(self.year or self.get_year()),
            poster=str(
                configuration.streaming_url
                / self.thumb.lstrip('/')
                % {'X-Plex-Token': configuration.access_token},
            )
            if self.thumb
            else None,
            type=PLEX_TO_STREMIO_MEDIA_TYPE.get(self.type, 'movie'),
            imdbRating=self.audience_rating,
            description=self.summary,
            genres=[g['tag'] for g in self.genre if isinstance(g, dict) and 'tag' in g],
        )

    def get_stremio_streams(self, configuration):
        from plexio.models.stremio import StremioStream

        streams = []
        for i, media in enumerate(self.media):
            if not isinstance(media, dict):
                continue
            parts = media.get('Part', [])
            if not parts or not isinstance(parts[0], dict):
                continue
            first_part = parts[0]
            part_key = first_part.get('key', '').lstrip('/')
            if not part_key:
                continue

            file_path = first_part.get('file', '')
            filename = os.path.basename(file_path) if file_path else self.title

            stream_name = format_stream_resolution_name(
                media.get('videoResolution'),
                media.get('width', 0),
            )

            u_audio_langs = []
            u_sub_langs = []
            external_subtitles = []
            for part_stream in first_part.get('Stream', []):
                if not isinstance(part_stream, dict):
                    continue
                stream_type = part_stream.get('streamType')
                tag = (
                    part_stream.get('languageTag')
                    or part_stream.get('languageCode')
                    or part_stream.get('language')
                    or ''
                ).upper().strip()

                if stream_type == 2:  # Audio
                    if tag and tag not in u_audio_langs and tag not in ('UNKNOWN', 'UND'):
                        u_audio_langs.append(tag)
                elif stream_type == 3:  # Subtítulos
                    if tag and tag not in u_sub_langs and tag not in ('UNKNOWN', 'UND'):
                        u_sub_langs.append(tag)
                    if 'key' in part_stream and part_stream['key']:
                        sub_key = part_stream['key'].lstrip('/')
                        external_subtitles.append(
                            {
                                'id': str(part_stream.get('id', '')),
                                'lang': part_stream.get('displayTitle', 'Subtítulo'),
                                'url': str(
                                    configuration.streaming_url
                                    / sub_key
                                    % {
                                        'X-Plex-Token': configuration.access_token,
                                    }
                                ),
                            }
                        )

            # Construir Línea 1
            line1_parts = [f'📁 {filename}']
            if u_audio_langs:
                line1_parts.append(f'• 🌐 {" / ".join(u_audio_langs)}')
            if u_sub_langs:
                line1_parts.append(f'• 💬 {" / ".join(u_sub_langs)}')

            if self.parent_index is not None and self.index is not None:
                line1_parts.append(f'S{self.parent_index:02d} • E{self.index:02d}')
            elif self.year:
                line1_parts.append(f'({self.year})')

            line1 = ' '.join(line1_parts)

            # Construir Línea 2
            size_formatted = format_file_size_bytes(first_part.get('size', 0))
            line2 = f'📦 {size_formatted} ' if size_formatted else ''

            # Construir Línea 3
            line3 = '❤️ PX Central'

            desc_lines = [line1]
            if line2:
                desc_lines.append(line2)
            desc_lines.append(line3)
            description = '\n'.join(desc_lines)

            binge_group = f"plex-{media.get('videoResolution', 'direct')}"
            streams.append(
                StremioStream(
                    name=stream_name,
                    description=description,
                    url=str(
                        configuration.streaming_url
                        / part_key
                        % {
                            'X-Plex-Token': configuration.access_token,
                        },
                    ),
                    subtitles=external_subtitles,
                    behaviorHints={'bingeGroup': binge_group},
                ),
            )

            if self.key:
                self_key = self.key.lstrip('/')
                transcode_url = (
                    configuration.streaming_url
                    / 'video/:/transcode/universal/start.m3u8'
                    % {
                        'path': f'/{self_key}',
                        'mediaIndex': i,
                        'protocol': 'hls',
                        'fastSeek': 1,
                        'copyts': 1,
                        'autoAdjustQuality': 0,
                        'X-Plex-Platform': 'Chrome',
                        'X-Plex-Token': configuration.access_token,
                    }
                )
                if configuration.include_transcode_original:
                    line3_trans_orig = '❤️ Transcode Original • PX Central'
                    desc_orig_lines = [line1]
                    if line2:
                        desc_orig_lines.append(line2)
                    desc_orig_lines.append(line3_trans_orig)
                    streams.append(
                        StremioStream(
                            name=stream_name,
                            description='\n'.join(desc_orig_lines),
                            url=str(transcode_url % {'videoQuality': 100}),
                            subtitles=external_subtitles,
                            behaviorHints={'bingeGroup': f'{binge_group}-transcode-original'},
                        ),
                    )

                if configuration.include_transcode_down:
                    for quality in configuration.transcode_down_qualities:
                        if quality not in RESOLUTION_QUALITY_PARAMS:
                            continue
                        quality_params = RESOLUTION_QUALITY_PARAMS[quality]
                        if media.get('width', 0) <= quality_params['min_width']:
                            continue
                        trans_name = format_stream_resolution_name(quality_params['name'])
                        line3_trans_down = f'❤️ Transcode {quality_params["name"]} • PX Central'
                        desc_down_lines = [line1, line3_trans_down]
                        streams.append(
                            StremioStream(
                                name=trans_name,
                                description='\n'.join(desc_down_lines),
                                url=str(transcode_url % quality_params['plex_args']),
                                subtitles=external_subtitles,
                                behaviorHints={'bingeGroup': f'{binge_group}-transcode-{quality_params["name"]}'},
                            ),
                        )

            if configuration.include_plex_tv and self.guid.startswith('plex:'):
                streams.append(
                    StremioStream(
                        name=stream_name,
                        description=f'📁 {filename}\n❤️ Abrir en plex.tv (externo) • PX Central',
                        externalUrl=f'https://app.plex.tv/#!/provider/tv.plex.provider.metadata/details?key=/library/metadata/{self.guid.split("/")[-1]}',
                    ),
                )

        return streams


class PlexEpisodeMeta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel)

    guid: str
    title: str
    index: int
    parent_index: int = 0
    added_at: int = 0

    type: str | None = None
    rating_key: str | None = None
    key: str | None = None
    parent_rating_key: str | None = None
    grandparent_rating_key: str | None = None
    studio: str | None = None
    grandparent_key: str | None = None
    parent_key: str | None = None
    grandparent_title: str | None = None
    parent_title: str | None = None
    content_rating: str | None = None
    summary: str = ''
    year: int | None = None
    thumb: str | None = None
    art: str | None = None
    parent_thumb: str | None = None
    grandparent_thumb: str | None = None
    grandparent_art: str | None = None
    grandparent_theme: str | None = None
    duration: int | None = None
    originally_available_at: str | None = None
    updated_at: int | None = None
    media: list = Field(default_factory=list)

    def to_stremio_video_meta(self, configuration):
        from plexio.models.stremio import StremioVideoMeta

        if self.originally_available_at:
            released = f'{self.originally_available_at}T00:00:00.000Z'
        else:
            released = datetime.fromtimestamp(self.added_at).strftime(
                '%Y-%m-%dT%H:%M:%S.%fZ',
            )

        return StremioVideoMeta(
            id=guid_to_plexio_id(self.guid),
            title=self.title,
            released=released,
            thumbnail=str(
                configuration.streaming_url
                / self.thumb.lstrip('/')
                % {'X-Plex-Token': configuration.access_token},
            )
            if self.thumb
            else None,
            episode=self.index,
            season=self.parent_index,
            overview=self.summary,
        )

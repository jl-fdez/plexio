from plexio.models.plex import PlexMediaType
from plexio.models.stremio import StremioMediaType

PLEX_TO_STREMIO_MEDIA_TYPE = {
    PlexMediaType.show: StremioMediaType.series,
    PlexMediaType.movie: StremioMediaType.movie,
    'show': StremioMediaType.series,
    'movie': StremioMediaType.movie,
    'series': StremioMediaType.series,
}

STREMIO_TO_PLEX_MEDIA_TYPE = {
    StremioMediaType.series: PlexMediaType.show,
    StremioMediaType.movie: PlexMediaType.movie,
    'series': PlexMediaType.show,
    'movie': PlexMediaType.movie,
}

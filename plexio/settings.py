from pydantic_settings import BaseSettings

from plexio.cache import CacheType


class Settings(BaseSettings):
    cors_origin_regex: str = (
        r'https?:\/\/localhost:\d+|.*plexio.stream|.*strem.io|.*stremio.com'
    )
    plex_requests_timeout: int = 20
    cache_type: CacheType = CacheType.memory
    redis_url: str = 'redis://redis:6399/0'
    plex_matching_token: str | None = None
    database_url: str = 'sqlite+aiosqlite:///plexio.db'
    jwt_secret_key: str = 'plexio-super-secret-admin-key-change-in-production-123456789'
    jwt_algorithm: str = 'HS256'
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 días de sesión admin


settings = Settings()

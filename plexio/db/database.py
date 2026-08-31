from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from plexio.settings import settings

Base = declarative_base()

# Manejar SQLite y otros motores async
engine_kwargs = {}
if settings.database_url.startswith('sqlite'):
    engine_kwargs['connect_args'] = {'check_same_thread': False}

engine = create_async_engine(
    settings.database_url,
    echo=False,
    **engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


import logging
from sqlalchemy import inspect

logger = logging.getLogger(__name__)


def _run_migrations(sync_conn):
    Base.metadata.create_all(sync_conn)

    # Comprobar columnas faltantes en tablas existentes (SQLite)
    inspector = inspect(sync_conn)
    existing_tables = inspector.get_table_names()

    if 'customers' in existing_tables:
        existing_cols = {col['name'] for col in inspector.get_columns('customers')}
        if 'max_devices' not in existing_cols:
            sync_conn.exec_driver_sql('ALTER TABLE customers ADD COLUMN max_devices INTEGER DEFAULT 1')
        if 'notes' not in existing_cols:
            sync_conn.exec_driver_sql('ALTER TABLE customers ADD COLUMN notes TEXT')
        if 'contact' not in existing_cols:
            sync_conn.exec_driver_sql('ALTER TABLE customers ADD COLUMN contact VARCHAR(255)')
        if 'status' not in existing_cols:
            sync_conn.exec_driver_sql("ALTER TABLE customers ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE'")

    if 'plex_server_configs' in existing_tables:
        existing_cols = {col['name'] for col in inspector.get_columns('plex_server_configs')}
        if 'include_plex_tv' not in existing_cols:
            sync_conn.exec_driver_sql('ALTER TABLE plex_server_configs ADD COLUMN include_plex_tv BOOLEAN DEFAULT 0')
        if 'transcode_original' not in existing_cols:
            sync_conn.exec_driver_sql('ALTER TABLE plex_server_configs ADD COLUMN transcode_original BOOLEAN DEFAULT 0')
        if 'transcode_down' not in existing_cols:
            sync_conn.exec_driver_sql('ALTER TABLE plex_server_configs ADD COLUMN transcode_down BOOLEAN DEFAULT 0')


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(_run_migrations)

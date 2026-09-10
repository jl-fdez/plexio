import logging
from collections.abc import AsyncGenerator
from sqlalchemy import event, inspect
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from plexio.settings import settings

logger = logging.getLogger(__name__)

Base = declarative_base()

# Manejar SQLite y otros motores async
engine_kwargs = {}
if settings.database_url.startswith('sqlite'):
    engine_kwargs['connect_args'] = {
        'check_same_thread': False,
        'timeout': 30,
    }

engine = create_async_engine(
    settings.database_url,
    echo=False,
    **engine_kwargs,
)

if settings.database_url.startswith('sqlite'):
    @event.listens_for(engine.sync_engine, 'connect')
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute('PRAGMA journal_mode=WAL;')
        cursor.execute('PRAGMA synchronous=NORMAL;')
        cursor.execute('PRAGMA busy_timeout=30000;')
        cursor.close()

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
            try:
                await session.rollback()
            except Exception:
                pass
            raise
        finally:
            await session.close()


def _run_migrations(sync_conn):
    if settings.database_url.startswith('sqlite'):
        sync_conn.exec_driver_sql('PRAGMA journal_mode=WAL;')
        sync_conn.exec_driver_sql('PRAGMA synchronous=NORMAL;')
        sync_conn.exec_driver_sql('PRAGMA busy_timeout=30000;')

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

    if 'payment_records' in existing_tables:
        existing_cols = {col['name'] for col in inspector.get_columns('payment_records')}
        if 'customer_name' not in existing_cols:
            sync_conn.exec_driver_sql('ALTER TABLE payment_records ADD COLUMN customer_name VARCHAR(255)')


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(_run_migrations)

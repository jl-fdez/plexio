from contextlib import asynccontextmanager

import aiohttp
import sentry_sdk
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from plexio.cache import init_cache
from plexio.db.database import init_db
from plexio.routers.addon import router as addon_router
from plexio.routers.admin_activity import router as admin_activity_router
from plexio.routers.admin_auth import router as admin_auth_router
from plexio.routers.admin_customers import router as admin_customers_router
from plexio.routers.admin_plex import router as admin_plex_router
from plexio.routers.configuration import router as configuration_router
from plexio.routers.customer_addon import router as customer_addon_router
from plexio.settings import settings


def before_send(event, hint):
    if 'exc_info' in hint:
        exc_type, exc_value, tb = hint['exc_info']
        if isinstance(exc_value, HTTPException) and exc_value.status_code in (502, 504):
            return None
    return event


sentry_sdk.init(before_send=before_send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    plex_client = aiohttp.ClientSession(
        headers={'accept': 'application/json'},
    )
    cache = init_cache(settings)

    yield {
        'plex_client': plex_client,
        'cache': cache,
    }

    await plex_client.close()
    await cache.close()


app = FastAPI(
    title='PX Central Admin & Stremio Addon API',
    lifespan=lifespan,
)

import logging
import traceback
from fastapi.responses import JSONResponse
from fastapi import Request

logger = logging.getLogger('plexio')

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


from starlette.exceptions import HTTPException as StarletteHTTPException


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        return JSONResponse(
            status_code=exc.status_code,
            content={'detail': exc.detail},
            headers=getattr(exc, 'headers', None),
        )
    logger.error('Unhandled exception on %s: %s\n%s', request.url, exc, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={
            'detail': 'Error interno del servidor',
            'error_type': type(exc).__name__,
            'error_message': str(exc),
            'path': str(request.url.path),
        },
    )

import os
from fastapi.responses import FileResponse

STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')


@app.get('/logo.png', include_in_schema=False)
async def get_logo_png():
    png_path = os.path.join(STATIC_DIR, 'logo.png')
    if os.path.exists(png_path):
        return FileResponse(
            png_path,
            media_type='image/png',
            headers={'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400'},
        )
    raise HTTPException(status_code=404, detail='Logo PNG no encontrado')


@app.get('/logo.svg', include_in_schema=False)
async def get_logo_svg():
    svg_path = os.path.join(STATIC_DIR, 'logo.svg')
    if os.path.exists(svg_path):
        return FileResponse(
            svg_path,
            media_type='image/svg+xml',
            headers={'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400'},
        )
    raise HTTPException(status_code=404, detail='Logo SVG no encontrado')


# Routers de administración
app.include_router(admin_auth_router)
app.include_router(admin_plex_router)
app.include_router(admin_customers_router)
app.include_router(admin_activity_router)

# Routers de Stremio
app.include_router(customer_addon_router)
app.include_router(addon_router)
app.include_router(configuration_router)


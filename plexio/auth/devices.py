import hashlib
import logging
import time
from datetime import datetime
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from plexio.db.models import Customer, CustomerDevice, Device

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    # Priorizar cabeceras de proxy inverso
    cf_ip = request.headers.get('cf-connecting-ip')
    if cf_ip:
        return cf_ip.strip()
    forwarded = request.headers.get('x-forwarded-for')
    if forwarded:
        return forwarded.split(',')[0].strip()
    real_ip = request.headers.get('x-real-ip')
    if real_ip:
        return real_ip.strip()
    if request.client:
        return request.client.host
    return '0.0.0.0'


def parse_device_name(user_agent: str, ip: str) -> str:
    ua = (user_agent or '').lower()
    if 'android' in ua:
        if 'tv' in ua or 'box' in ua or 'aft' in ua:
            return 'Android TV / TV Box'
        return 'Dispositivo Android'
    elif 'windows' in ua:
        return 'Stremio en Windows PC'
    elif 'macintosh' in ua or 'mac os' in ua:
        return 'Stremio en Mac / Apple'
    elif 'iphone' in ua:
        return 'iPhone (Stremio)'
    elif 'ipad' in ua:
        return 'iPad (Stremio)'
    elif 'aft' in ua or 'firetv' in ua:
        return 'Amazon Fire TV Stick'
    elif 'tizen' in ua or 'samsung' in ua:
        return 'Samsung Smart TV'
    elif 'web0s' in ua or 'webos' in ua or 'lg' in ua:
        return 'LG Smart TV'
    elif 'linux' in ua:
        return 'Stremio en Linux'
    elif 'stremio' in ua:
        return 'Aplicación Stremio'
    elif 'okhttp' in ua or 'exoplayer' in ua:
        return 'Reproductor Smart TV'
    
    return f'Dispositivo ({ip[:12]})'


def get_device_platform_category(user_agent: str) -> str:
    """Categoriza el User-Agent en una familia de plataforma tecnológica."""
    ua = (user_agent or '').lower()
    if 'tizen' in ua or 'samsung' in ua:
        return 'samsung_tv'
    if 'web0s' in ua or 'webos' in ua or 'lg' in ua:
        return 'lg_tv'
    if 'aft' in ua or 'firetv' in ua:
        return 'fire_tv'
    if 'android' in ua or 'exoplayer' in ua or 'okhttp' in ua:
        return 'android'
    if 'windows' in ua or 'mpv' in ua or 'lavf' in ua:
        return 'windows'
    if 'macintosh' in ua or 'mac os' in ua or 'cfnetwork' in ua or 'darwin' in ua:
        return 'apple'
    if 'iphone' in ua or 'ipad' in ua or 'ios' in ua:
        return 'ios'
    if 'linux' in ua:
        return 'linux'
    return 'other'


def generate_physical_fingerprint(user_agent: str, ip: str) -> str:
    """
    Huella digital física independiente del cliente.
    Identifica el hardware real y la red para que múltiples usuarios
    puedan compartir el mismo dispositivo físico a la vez.
    """
    category = get_device_platform_category(user_agent)
    clean_ua = (user_agent or 'Unknown').strip().lower()
    norm_ip = (ip or '0.0.0.0').strip()
    raw = f'{category}_{clean_ua}_{norm_ip}'.encode('utf-8')
    return hashlib.sha256(raw).hexdigest()[:32]


def generate_fingerprint(customer_id: int, user_agent: str) -> str:
    """Compatibilidad con huellas previas."""
    category = get_device_platform_category(user_agent)
    clean_ua = (user_agent or 'Unknown').strip().lower()
    raw = f'{customer_id}_{category}_{clean_ua}'.encode('utf-8')
    return hashlib.sha256(raw).hexdigest()[:32]


_last_device_update: dict[int, float] = {}


async def check_and_register_device(
    customer: Customer,
    request: Request,
    db: AsyncSession,
) -> tuple[bool, str]:
    """
    Verifica si el dispositivo físico tiene permitido el acceso según customer.max_devices.
    Retorna (is_allowed, device_name_or_error_message).

    Soporta explícitamente:
    1. Que MÚLTIPLES usuarios puedan usar un mismo dispositivo a la vez.
    2. Que UN dispositivo físico tenga múltiples usuarios asociados a la vez.
    """
    ip = get_client_ip(request)
    ua = request.headers.get('user-agent', 'Desconocido')
    req_category = get_device_platform_category(ua)
    physical_fp = generate_physical_fingerprint(ua, ip)
    dev_name = parse_device_name(ua, ip)

    # 1. Localizar o registrar el dispositivo físico global (Device)
    stmt_dev = select(Device).where(Device.device_fingerprint == physical_fp)
    res_dev = await db.execute(stmt_dev)
    physical_device = res_dev.scalars().first()

    # Si no coincide la huella exacta, buscar por IP y categoría si la IP es válida
    if not physical_device and ip and ip != '0.0.0.0':
        ip_stmt = select(Device).where(Device.ip_address == ip)
        res_ip = await db.execute(ip_stmt)
        for dev in res_ip.scalars().all():
            dev_cat = get_device_platform_category(dev.user_agent or '')
            if dev_cat == req_category or (
                req_category in ('android', 'windows') and dev_cat in ('android', 'windows')
            ):
                physical_device = dev
                break

    if not physical_device:
        physical_device = Device(
            device_fingerprint=physical_fp,
            device_name=dev_name,
            ip_address=ip,
            user_agent=ua[:500] if ua else None,
            last_active=datetime.utcnow(),
        )
        try:
            db.add(physical_device)
            await db.flush()
        except Exception as add_dev_err:
            try:
                await db.rollback()
            except Exception:
                pass
            logger.warning('Aviso: no se pudo persistir physical_device nuevo: %s', add_dev_err)
            # Reintentar obtener por huella si hubo inserción concurrente
            stmt_retry = select(Device).where(Device.device_fingerprint == physical_fp)
            physical_device = (await db.execute(stmt_retry)).scalars().first()

    phys_id = physical_device.id if physical_device else None

    # 2. Buscar si este cliente (Customer) ya tiene vinculado este dispositivo físico
    existing_link = None
    if phys_id:
        link_stmt = select(CustomerDevice).where(
            CustomerDevice.customer_id == customer.id,
            CustomerDevice.device_id == phys_id,
        )
        existing_link = (await db.execute(link_stmt)).scalars().first()

    if not existing_link:
        # Fallback de búsqueda por huella física o IP previa para el cliente
        stmt_fp = select(CustomerDevice).where(
            CustomerDevice.customer_id == customer.id,
            CustomerDevice.device_fingerprint == physical_fp,
        )
        existing_link = (await db.execute(stmt_fp)).scalars().first()

    if not existing_link and ip and ip != '0.0.0.0':
        stmt_link_ip = select(CustomerDevice).where(
            CustomerDevice.customer_id == customer.id,
            CustomerDevice.ip_address == ip,
        )
        for cand in (await db.execute(stmt_link_ip)).scalars().all():
            cand_cat = get_device_platform_category(cand.user_agent or '')
            if cand_cat == req_category:
                existing_link = cand
                break

    # 3. Si el dispositivo ya está vinculado a este cliente: permitir acceso inmediato y actualizar timestamps
    if existing_link:
        now_ts = time.time()
        # Throttling en memoria: no escribir en DB en cada request para no saturar SQLite
        if existing_link.id and (now_ts - _last_device_update.get(existing_link.id, 0)) < 60:
            return True, existing_link.device_name

        now = datetime.utcnow()
        needs_update = False
        if not existing_link.last_active or (now - existing_link.last_active).total_seconds() > 60:
            existing_link.last_active = now
            needs_update = True
        if ip and ip != '0.0.0.0' and existing_link.ip_address != ip:
            existing_link.ip_address = ip
            needs_update = True
        if phys_id and not existing_link.device_id:
            existing_link.device_id = phys_id
            needs_update = True

        if physical_device:
            physical_device.last_active = now
            if ip and ip != '0.0.0.0':
                physical_device.ip_address = ip

        if needs_update:
            if existing_link.id:
                _last_device_update[existing_link.id] = now_ts
            try:
                await db.flush()
            except Exception as flush_err:
                try:
                    await db.rollback()
                except Exception:
                    pass
                logger.warning('Aviso: no se pudo actualizar last_active del dispositivo %s: %s', existing_link.id, flush_err)
        return True, existing_link.device_name

    # 4. Es un nuevo dispositivo para este cliente: verificar límite de dispositivos del cliente
    count_stmt = select(func.count(CustomerDevice.id)).where(
        CustomerDevice.customer_id == customer.id
    )
    current_device_count = (await db.execute(count_stmt)).scalar_one()
    max_allowed = customer.max_devices if customer.max_devices and customer.max_devices > 0 else 1

    if current_device_count >= max_allowed:
        return (
            False,
            f'Has alcanzado el límite permitido de {max_allowed} dispositivo(s). '
            f'Contacta a tu proveedor para ampliar tu plan o desvincular dispositivos.',
        )

    # 5. Vincular este dispositivo físico a este cliente (un dispositivo físico con múltiples usuarios)
    new_link = CustomerDevice(
        customer_id=customer.id,
        device_id=phys_id,
        device_fingerprint=physical_fp,
        device_name=dev_name,
        ip_address=ip,
        user_agent=ua[:500] if ua else None,
        last_active=datetime.utcnow(),
    )
    try:
        db.add(new_link)
        await db.flush()
        if new_link.id:
            _last_device_update[new_link.id] = time.time()
    except Exception as add_err:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.warning('Error al persistir vinculación de dispositivo: %s', add_err)

    return True, dev_name

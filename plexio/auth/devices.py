import hashlib
from datetime import datetime
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from plexio.db.models import Customer, CustomerDevice


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
    ua = user_agent.lower()
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
    elif 'web0s' in ua or 'lg' in ua:
        return 'LG Smart TV'
    elif 'linux' in ua:
        return 'Stremio en Linux'
    elif 'stremio' in ua:
        return 'Aplicación Stremio'
    elif 'okhttp' in ua or 'exoplayer' in ua:
        return 'Reproductor Smart TV'
    
    return f'Dispositivo ({ip[:12]})'


def generate_fingerprint(customer_id: int, user_agent: str) -> str:
    # Huella digital basada en cliente y User-Agent normalizado
    # Permite cambios de IP dinámica o Wi-Fi sin expulsar el dispositivo legítimo
    clean_ua = (user_agent or 'Unknown').strip().lower()
    raw = f'{customer_id}_{clean_ua}'.encode('utf-8')
    return hashlib.sha256(raw).hexdigest()[:32]


async def check_and_register_device(
    customer: Customer,
    request: Request,
    db: AsyncSession,
) -> tuple[bool, str]:
    """
    Verifica si el dispositivo tiene permitido el acceso según customer.max_devices.
    Retorna (is_allowed, device_name_or_error_message).
    """
    ip = get_client_ip(request)
    ua = request.headers.get('user-agent', 'Desconocido')
    fingerprint = generate_fingerprint(customer.id, ua)

    # 1. Buscar si este dispositivo ya está registrado para este cliente
    stmt = select(CustomerDevice).where(
        CustomerDevice.customer_id == customer.id,
        CustomerDevice.device_fingerprint == fingerprint,
    )
    result = await db.execute(stmt)
    existing_device = result.scalar_one_or_none()

    if existing_device:
        # Dispositivo ya conocido: actualizar última actividad e IP
        existing_device.last_active = datetime.utcnow()
        existing_device.ip_address = ip
        return True, existing_device.device_name

    # 2. Si es un dispositivo nuevo, contar cuántos tiene actualmente
    count_stmt = select(func.count(CustomerDevice.id)).where(
        CustomerDevice.customer_id == customer.id
    )
    current_device_count = (await db.execute(count_stmt)).scalar_one()

    # 3. Comprobar límite de dispositivos
    max_allowed = customer.max_devices if customer.max_devices and customer.max_devices > 0 else 1

    if current_device_count >= max_allowed:
        return (
            False,
            f'Has alcanzado el límite permitido de {max_allowed} dispositivo(s). '
            f'Contacta a tu proveedor para ampliar tu plan o desvincular dispositivos.',
        )

    # 4. Registrar nuevo dispositivo
    device_name = parse_device_name(ua, ip)
    new_device = CustomerDevice(
        customer_id=customer.id,
        device_fingerprint=fingerprint,
        device_name=device_name,
        ip_address=ip,
        user_agent=ua[:500] if ua else None,
        last_active=datetime.utcnow(),
    )
    db.add(new_device)
    await db.flush()

    return True, device_name

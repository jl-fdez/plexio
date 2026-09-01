import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from plexio.auth.security import get_current_admin
from plexio.db.database import get_db
from plexio.db.models import AdminUser, Customer, CustomerDevice, PaymentRecord

router = APIRouter(prefix='/api/admin', tags=['Admin Customers & Payments'])


class CreateCustomerRequest(BaseModel):
    name: str
    contact: str | None = None
    notes: str | None = None
    expiration_date: datetime | None = None
    max_devices: int = 1
    # Datos del pago inicial opcional
    register_payment: bool = False
    amount: float = 0.0
    currency: str = 'USD'
    plan_name: str | None = 'Mensual'
    payment_method: str | None = 'Efectivo'


class UpdateCustomerRequest(BaseModel):
    name: str
    contact: str | None = None
    notes: str | None = None
    expiration_date: datetime
    max_devices: int = 1
    status: str = 'ACTIVE'


class RenewCustomerRequest(BaseModel):
    new_expiration_date: datetime
    register_payment: bool = True
    amount: float = 0.0
    currency: str = 'USD'
    plan_name: str | None = 'Renovación'
    payment_method: str | None = 'Efectivo'
    note: str | None = None


class CustomerResponse(BaseModel):
    id: int
    uuid_token: str
    name: str
    contact: str | None
    notes: str | None
    status: str
    computed_status: str
    start_date: datetime
    expiration_date: datetime
    max_devices: int
    created_at: datetime
    total_paid: float = 0.0


def parse_expiration_date(exp) -> datetime:
    if isinstance(exp, datetime):
        return exp
    if isinstance(exp, str):
        try:
            return datetime.fromisoformat(exp.replace('Z', '+00:00')).replace(tzinfo=None)
        except Exception:
            return datetime.utcnow()
    return datetime.utcnow()


def compute_customer_status(customer: Customer) -> str:
    if customer.status != 'ACTIVE':
        return 'SUSPENDED'
    exp = parse_expiration_date(customer.expiration_date)
    now = datetime.utcnow()
    if exp < now:
        return 'EXPIRED'
    if exp <= now + timedelta(days=3):
        return 'EXPIRING_SOON'
    return 'ACTIVE'


@router.get('/stats')
async def get_dashboard_stats(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    three_days_later = now + timedelta(days=3)

    # Clientes totales
    stmt_total = select(func.count(Customer.id))
    total_customers = (await db.execute(stmt_total)).scalar_one()

    # Clientes suspendidos / inactivos manualmente
    stmt_suspended = select(func.count(Customer.id)).where(Customer.status != 'ACTIVE')
    suspended_customers = (await db.execute(stmt_suspended)).scalar_one()

    # Clientes expirados (status ACTIVE pero fecha anterior a hoy)
    stmt_expired = select(func.count(Customer.id)).where(
        Customer.status == 'ACTIVE',
        Customer.expiration_date < now,
    )
    expired_customers = (await db.execute(stmt_expired)).scalar_one()

    # Clientes por vencer (en los próximos 3 días)
    stmt_expiring_soon = select(func.count(Customer.id)).where(
        Customer.status == 'ACTIVE',
        Customer.expiration_date >= now,
        Customer.expiration_date <= three_days_later,
    )
    expiring_soon_customers = (await db.execute(stmt_expiring_soon)).scalar_one()

    # Clientes activos reales (status ACTIVE y no vencidos)
    stmt_active = select(func.count(Customer.id)).where(
        Customer.status == 'ACTIVE',
        Customer.expiration_date >= now,
    )
    active_customers = (await db.execute(stmt_active)).scalar_one()

    # Ingresos del mes
    stmt_income = select(func.coalesce(func.sum(PaymentRecord.amount), 0.0)).where(
        PaymentRecord.payment_date >= month_start,
    )
    monthly_income = (await db.execute(stmt_income)).scalar_one()

    # Ingresos totales históricos
    stmt_all_income = select(func.coalesce(func.sum(PaymentRecord.amount), 0.0))
    total_income = (await db.execute(stmt_all_income)).scalar_one()

    return {
        'total_customers': total_customers,
        'active_customers': active_customers,
        'expiring_soon_customers': expiring_soon_customers,
        'expired_customers': expired_customers,
        'suspended_customers': suspended_customers,
        'monthly_income': round(float(monthly_income), 2),
        'total_income': round(float(total_income), 2),
    }


@router.get('/customers')
async def list_customers(
    q: str = Query('', description='Búsqueda por nombre o contacto'),
    status_filter: str = Query('ALL', description='ALL, ACTIVE, EXPIRING_SOON, EXPIRED, SUSPENDED'),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Customer)
        .options(
            selectinload(Customer.payments),
            selectinload(Customer.devices),
        )
        .order_by(desc(Customer.created_at))
    )

    if q.strip():
        search = f'%{q.strip()}%'
        stmt = stmt.where(or_(Customer.name.ilike(search), Customer.contact.ilike(search)))

    result = await db.execute(stmt)
    customers = result.scalars().all()

    output = []
    for c in customers:
        computed = compute_customer_status(c)
        if status_filter != 'ALL':
            if status_filter == 'ACTIVE' and computed not in ('ACTIVE', 'EXPIRING_SOON'):
                continue
            elif status_filter == 'EXPIRING_SOON' and computed != 'EXPIRING_SOON':
                continue
            elif status_filter == 'EXPIRED' and computed != 'EXPIRED':
                continue
            elif status_filter == 'SUSPENDED' and computed != 'SUSPENDED':
                continue

        total_paid = sum(p.amount for p in c.payments)
        output.append(
            {
                'id': c.id,
                'uuid_token': c.uuid_token,
                'name': c.name,
                'contact': c.contact,
                'notes': c.notes,
                'status': c.status,
                'computed_status': computed,
                'start_date': c.start_date,
                'expiration_date': c.expiration_date,
                'max_devices': c.max_devices,
                'devices_count': len(c.devices),
                'created_at': c.created_at,
                'total_paid': round(float(total_paid), 2),
            }
        )

    return output


@router.post('/customers')
async def create_customer(
    payload: CreateCustomerRequest,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if not payload.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='El nombre del cliente es obligatorio.',
        )

    exp_date = payload.expiration_date or (datetime.utcnow() + timedelta(days=3650))
    customer = Customer(
        uuid_token=str(uuid.uuid4()),
        name=payload.name.strip(),
        contact=payload.contact.strip() if payload.contact else None,
        notes=payload.notes.strip() if payload.notes else None,
        status='ACTIVE',
        start_date=datetime.utcnow(),
        expiration_date=exp_date,
        max_devices=payload.max_devices,
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)

    if payload.register_payment and payload.amount > 0:
        payment = PaymentRecord(
            customer_id=customer.id,
            customer_name=customer.name,
            amount=payload.amount,
            currency=payload.currency,
            payment_date=datetime.utcnow(),
            plan_name=payload.plan_name,
            payment_method=payload.payment_method,
            note='Pago inicial al registrar cliente',
        )
        db.add(payment)
        await db.flush()

    return {
        'success': True,
        'customer_id': customer.id,
        'uuid_token': customer.uuid_token,
        'message': 'Cliente registrado correctamente.',
    }


@router.get('/customers/{customer_id}')
async def get_customer_detail(
    customer_id: int,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Customer)
        .options(selectinload(Customer.payments))
        .where(Customer.id == customer_id)
    )
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Cliente no encontrado.',
        )

    payments = [
        {
            'id': p.id,
            'amount': p.amount,
            'currency': p.currency,
            'payment_date': p.payment_date,
            'plan_name': p.plan_name,
            'payment_method': p.payment_method,
            'note': p.note,
        }
        for p in customer.payments
    ]

    return {
        'id': customer.id,
        'uuid_token': customer.uuid_token,
        'name': customer.name,
        'contact': customer.contact,
        'notes': customer.notes,
        'status': customer.status,
        'computed_status': compute_customer_status(customer),
        'start_date': customer.start_date,
        'expiration_date': customer.expiration_date,
        'max_devices': customer.max_devices,
        'created_at': customer.created_at,
        'payments': sorted(payments, key=lambda x: x['payment_date'], reverse=True),
    }


@router.put('/customers/{customer_id}')
async def update_customer(
    customer_id: int,
    payload: UpdateCustomerRequest,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Customer).where(Customer.id == customer_id)
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Cliente no encontrado.',
        )

    customer.name = payload.name.strip()
    customer.contact = payload.contact.strip() if payload.contact else None
    customer.notes = payload.notes.strip() if payload.notes else None
    customer.expiration_date = payload.expiration_date
    customer.max_devices = payload.max_devices
    customer.status = payload.status
    customer.updated_at = datetime.utcnow()

    return {'success': True, 'message': 'Cliente actualizado correctamente.'}


@router.post('/customers/{customer_id}/renew')
async def renew_customer(
    customer_id: int,
    payload: RenewCustomerRequest,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Customer).where(Customer.id == customer_id)
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Cliente no encontrado.',
        )

    customer.expiration_date = payload.new_expiration_date
    customer.status = 'ACTIVE'
    customer.updated_at = datetime.utcnow()

    if payload.register_payment and payload.amount > 0:
        payment = PaymentRecord(
            customer_id=customer.id,
            customer_name=customer.name,
            amount=payload.amount,
            currency=payload.currency,
            payment_date=datetime.utcnow(),
            plan_name=payload.plan_name,
            payment_method=payload.payment_method,
            note=payload.note or 'Renovación de suscripción',
        )
        db.add(payment)

    return {'success': True, 'message': 'Suscripción renovada correctamente.'}


@router.post('/customers/{customer_id}/toggle-status')
async def toggle_customer_status(
    customer_id: int,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Customer).where(Customer.id == customer_id)
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Cliente no encontrado.',
        )

    if customer.status == 'ACTIVE':
        customer.status = 'SUSPENDED'
    else:
        customer.status = 'ACTIVE'

    customer.updated_at = datetime.utcnow()
    return {'success': True, 'new_status': customer.status}


@router.delete('/customers/{customer_id}')
async def delete_customer(
    customer_id: int,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Customer).where(Customer.id == customer_id)
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Cliente no encontrado.',
        )

    # Conservar el historial de pagos: preservar el nombre del cliente y desvincular customer_id
    stmt_p = select(PaymentRecord).where(PaymentRecord.customer_id == customer.id)
    res_p = await db.execute(stmt_p)
    for p in res_p.scalars().all():
        if not p.customer_name:
            p.customer_name = customer.name
        p.customer_id = None

    await db.delete(customer)
    return {'success': True, 'message': 'Cliente eliminado correctamente (el historial de pagos se conservó).'}


@router.get('/payments')
async def list_recent_payments(
    limit: int = Query(50, ge=1, le=200),
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PaymentRecord)
        .options(selectinload(PaymentRecord.customer))
        .order_by(desc(PaymentRecord.payment_date))
        .limit(limit)
    )
    result = await db.execute(stmt)
    payments = result.scalars().all()

    return [
        {
            'id': p.id,
            'customer_id': p.customer_id,
            'customer_name': p.customer_name or (p.customer.name if p.customer else 'Cliente Eliminado'),
            'amount': p.amount,
            'currency': p.currency,
            'payment_date': p.payment_date,
            'plan_name': p.plan_name,
            'payment_method': p.payment_method,
            'note': p.note,
        }
        for p in payments
    ]


@router.get('/customers/{customer_id}/devices')
async def list_customer_devices(
    customer_id: int,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(CustomerDevice)
        .where(CustomerDevice.customer_id == customer_id)
        .order_by(desc(CustomerDevice.last_active))
    )
    result = await db.execute(stmt)
    devices = result.scalars().all()

    return [
        {
            'id': d.id,
            'device_name': d.device_name,
            'ip_address': d.ip_address,
            'user_agent': d.user_agent,
            'last_active': d.last_active,
            'created_at': d.created_at,
        }
        for d in devices
    ]


@router.delete('/customers/{customer_id}/devices/{device_id}')
async def delete_customer_device(
    customer_id: int,
    device_id: int,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CustomerDevice).where(
        CustomerDevice.id == device_id,
        CustomerDevice.customer_id == customer_id,
    )
    result = await db.execute(stmt)
    device = result.scalar_one_or_none()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Dispositivo no encontrado.',
        )

    await db.delete(device)
    return {'success': True, 'message': f'Dispositivo {device.device_name} desvinculado correctamente.'}


@router.delete('/customers/{customer_id}/devices')
async def reset_customer_devices(
    customer_id: int,
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CustomerDevice).where(CustomerDevice.customer_id == customer_id)
    result = await db.execute(stmt)
    devices = result.scalars().all()

    for d in devices:
        await db.delete(d)

    return {'success': True, 'message': f'Se desvincularon todos los dispositivos ({len(devices)}) del cliente.'}


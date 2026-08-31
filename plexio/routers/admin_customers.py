import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from plexio.auth.security import get_current_admin
from plexio.db.database import get_db
from plexio.db.models import AdminUser, Customer, PaymentRecord

router = APIRouter(prefix='/api/admin', tags=['Admin Customers & Payments'])


class CreateCustomerRequest(BaseModel):
    name: str
    contact: str | None = None
    notes: str | None = None
    expiration_date: datetime
    max_devices: int = 1
    # Datos del pago inicial opcional
    register_payment: bool = True
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


def compute_customer_status(customer: Customer) -> str:
    if customer.status == 'SUSPENDED':
        return 'SUSPENDED'
    now = datetime.utcnow()
    if customer.expiration_date < now:
        return 'EXPIRED'
    if customer.expiration_date <= now + timedelta(days=3):
        return 'EXPIRING_SOON'
    return 'ACTIVE'


@router.get('/stats')
async def get_dashboard_stats(
    admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)

    # Clientes totales
    stmt_total = select(func.count(Customer.id))
    total_customers = (await db.execute(stmt_total)).scalar_one()

    # Clientes activos (status == ACTIVE y expiration_date >= now)
    stmt_active = select(func.count(Customer.id)).where(
        Customer.status == 'ACTIVE',
        Customer.expiration_date >= now,
    )
    active_customers = (await db.execute(stmt_active)).scalar_one()

    # Clientes por vencer (entre now y now + 3 días)
    stmt_expiring = select(func.count(Customer.id)).where(
        Customer.status == 'ACTIVE',
        Customer.expiration_date >= now,
        Customer.expiration_date <= now + timedelta(days=3),
    )
    expiring_soon_customers = (await db.execute(stmt_expiring)).scalar_one()

    # Clientes vencidos
    stmt_expired = select(func.count(Customer.id)).where(
        or_(
            Customer.expiration_date < now,
            Customer.status == 'EXPIRED',
        ),
    )
    expired_customers = (await db.execute(stmt_expired)).scalar_one()

    # Clientes suspendidos
    stmt_suspended = select(func.count(Customer.id)).where(Customer.status == 'SUSPENDED')
    suspended_customers = (await db.execute(stmt_suspended)).scalar_one()

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
        .options(selectinload(Customer.payments))
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

    customer = Customer(
        uuid_token=str(uuid.uuid4()),
        name=payload.name.strip(),
        contact=payload.contact.strip() if payload.contact else None,
        notes=payload.notes.strip() if payload.notes else None,
        status='ACTIVE',
        start_date=datetime.utcnow(),
        expiration_date=payload.expiration_date,
        max_devices=payload.max_devices,
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)

    if payload.register_payment and payload.amount > 0:
        payment = PaymentRecord(
            customer_id=customer.id,
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

    if payload.amount > 0:
        payment = PaymentRecord(
            customer_id=customer.id,
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

    await db.delete(customer)
    return {'success': True, 'message': 'Cliente eliminado correctamente.'}


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
            'customer_name': p.customer.name if p.customer else 'Cliente Eliminado',
            'amount': p.amount,
            'currency': p.currency,
            'payment_date': p.payment_date,
            'plan_name': p.plan_name,
            'payment_method': p.payment_method,
            'note': p.note,
        }
        for p in payments
    ]

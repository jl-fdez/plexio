from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from plexio.auth.security import (
    create_access_token,
    get_current_admin,
    hash_password,
    verify_password,
)
from plexio.db.database import get_db
from plexio.db.models import AdminUser

router = APIRouter(prefix='/api/admin/auth', tags=['Admin Auth'])


class SetupAdminRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class AdminResponse(BaseModel):
    id: int
    username: str
    email: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    admin: AdminResponse


@router.get('/setup-required')
async def check_setup_required(db: AsyncSession = Depends(get_db)):
    stmt = select(func.count(AdminUser.id))
    result = await db.execute(stmt)
    count = result.scalar_one()
    return {'setup_required': count == 0}


@router.post('/setup', response_model=LoginResponse)
async def setup_initial_admin(
    payload: SetupAdminRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(func.count(AdminUser.id))
    result = await db.execute(stmt)
    count = result.scalar_one()

    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='El administrador principal ya ha sido configurado.',
        )

    if len(payload.username.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='El nombre de usuario debe tener al menos 3 caracteres.',
        )

    if len(payload.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='La contraseña debe tener al menos 6 caracteres.',
        )

    admin = AdminUser(
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        email=payload.email.strip() if payload.email else None,
    )
    db.add(admin)
    await db.flush()
    await db.refresh(admin)

    token = create_access_token(data={'sub': admin.username})
    return LoginResponse(
        access_token=token,
        admin=AdminResponse(
            id=admin.id,
            username=admin.username,
            email=admin.email,
        ),
    )


@router.post('/login', response_model=LoginResponse)
async def login_admin(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AdminUser).where(AdminUser.username == payload.username.strip())
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Usuario o contraseña incorrectos.',
        )

    token = create_access_token(data={'sub': admin.username})
    return LoginResponse(
        access_token=token,
        admin=AdminResponse(
            id=admin.id,
            username=admin.username,
            email=admin.email,
        ),
    )


@router.get('/me', response_model=AdminResponse)
async def get_me(admin: AdminUser = Depends(get_current_admin)):
    return AdminResponse(
        id=admin.id,
        username=admin.username,
        email=admin.email,
    )

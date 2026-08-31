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


class CreateAdminRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class UpdateAdminRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str | None = None


class AdminResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    created_at: str | None = None


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
            created_at=admin.created_at.isoformat() if admin.created_at else None,
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
            created_at=admin.created_at.isoformat() if admin.created_at else None,
        ),
    )


@router.get('/me', response_model=AdminResponse)
async def get_me(admin: AdminUser = Depends(get_current_admin)):
    return AdminResponse(
        id=admin.id,
        username=admin.username,
        email=admin.email,
        created_at=admin.created_at.isoformat() if admin.created_at else None,
    )


@router.get('/users', response_model=list[AdminResponse])
async def list_admin_users(
    db: AsyncSession = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin),
):
    stmt = select(AdminUser).order_by(AdminUser.id.asc())
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [
        AdminResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            created_at=u.created_at.isoformat() if u.created_at else None,
        )
        for u in users
    ]


@router.post('/users', response_model=AdminResponse, status_code=status.HTTP_201_CREATED)
async def create_admin_user(
    payload: CreateAdminRequest,
    db: AsyncSession = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin),
):
    clean_username = payload.username.strip()
    if len(clean_username) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='El nombre de usuario debe tener al menos 3 caracteres.',
        )

    if len(payload.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='La contraseña debe tener al menos 6 caracteres.',
        )

    # Verificar si el usuario ya existe
    stmt = select(AdminUser).where(AdminUser.username == clean_username)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'El nombre de usuario "{clean_username}" ya está registrado.',
        )

    new_admin = AdminUser(
        username=clean_username,
        password_hash=hash_password(payload.password),
        email=payload.email.strip() if payload.email else None,
    )
    db.add(new_admin)
    await db.flush()
    await db.refresh(new_admin)

    return AdminResponse(
        id=new_admin.id,
        username=new_admin.username,
        email=new_admin.email,
        created_at=new_admin.created_at.isoformat() if new_admin.created_at else None,
    )


@router.put('/users/{user_id}', response_model=AdminResponse)
async def update_admin_user(
    user_id: int,
    payload: UpdateAdminRequest,
    db: AsyncSession = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin),
):
    stmt = select(AdminUser).where(AdminUser.id == user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Administrador no encontrado.',
        )

    if payload.username is not None:
        clean_username = payload.username.strip()
        if len(clean_username) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='El nombre de usuario debe tener al menos 3 caracteres.',
            )
        # Verificar unicidad si cambia de nombre
        if clean_username != target_user.username:
            check_stmt = select(AdminUser).where(AdminUser.username == clean_username)
            exists = (await db.execute(check_stmt)).scalar_one_or_none()
            if exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f'El nombre de usuario "{clean_username}" ya está en uso.',
                )
            target_user.username = clean_username

    if payload.email is not None:
        target_user.email = payload.email.strip() if payload.email.strip() else None

    if payload.password is not None and payload.password.strip():
        if len(payload.password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='La nueva contraseña debe tener al menos 6 caracteres.',
            )
        target_user.password_hash = hash_password(payload.password)

    await db.flush()
    await db.refresh(target_user)

    return AdminResponse(
        id=target_user.id,
        username=target_user.username,
        email=target_user.email,
        created_at=target_user.created_at.isoformat() if target_user.created_at else None,
    )


@router.delete('/users/{user_id}')
async def delete_admin_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    stmt = select(AdminUser).where(AdminUser.id == user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Administrador no encontrado.',
        )

    # Contar administradores totales
    count_stmt = select(func.count(AdminUser.id))
    total_admins = (await db.execute(count_stmt)).scalar_one()

    if total_admins <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='No puedes eliminar el único administrador del sistema.',
        )

    if target_user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Por seguridad, no puedes eliminar tu propia cuenta en sesión actual.',
        )

    await db.delete(target_user)
    return {'message': f'Administrador {target_user.username} eliminado correctamente.'}


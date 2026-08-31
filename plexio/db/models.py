import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from plexio.db.database import Base


class AdminUser(Base):
    __tablename__ = 'admin_users'

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PlexServerConfig(Base):
    __tablename__ = 'plex_server_configs'

    id = Column(Integer, primary_key=True, index=True)
    server_name = Column(String(255), nullable=False)
    access_token = Column(String(255), nullable=False)
    discovery_url = Column(String(500), nullable=False)
    streaming_url = Column(String(500), nullable=False)
    sections_json = Column(Text, default='[]')
    transcode_original = Column(Boolean, default=False)
    transcode_down = Column(Boolean, default=False)
    transcode_qualities_json = Column(Text, default='[]')
    include_plex_tv = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Customer(Base):
    __tablename__ = 'customers'

    id = Column(Integer, primary_key=True, index=True)
    uuid_token = Column(
        String(64),
        unique=True,
        index=True,
        default=lambda: str(uuid.uuid4()),
        nullable=False,
    )
    name = Column(String(255), nullable=False, index=True)
    contact = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(50), default='ACTIVE', index=True)  # ACTIVE, SUSPENDED, EXPIRED
    start_date = Column(DateTime, default=datetime.utcnow)
    expiration_date = Column(DateTime, nullable=False, index=True)
    max_devices = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    payments = relationship('PaymentRecord', back_populates='customer', cascade='all, delete-orphan')


class PaymentRecord(Base):
    __tablename__ = 'payment_records'

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey('customers.id', ondelete='CASCADE'), nullable=False)
    amount = Column(Float, default=0.0)
    currency = Column(String(10), default='USD')
    payment_date = Column(DateTime, default=datetime.utcnow)
    plan_name = Column(String(100), nullable=True)
    payment_method = Column(String(100), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship('Customer', back_populates='payments')

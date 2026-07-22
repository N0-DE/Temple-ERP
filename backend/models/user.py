from sqlalchemy import Column, Integer, String, Boolean, Enum
import enum
from core.database import Base

class RoleEnum(str, enum.Enum):
    admin = "Admin"
    manager = "Manager"
    counter_staff = "Counter Staff"
    priest = "Priest"
    auditor = "Auditor"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(Enum(RoleEnum), default=RoleEnum.counter_staff)
    is_active = Column(Boolean, default=True)

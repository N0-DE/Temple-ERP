from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

class DevoteeBase(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    date_of_birth: Optional[date] = None
    star: Optional[str] = None
    nakshatra: Optional[str] = None
    total_donations: float = 0.0

class DevoteeCreate(DevoteeBase):
    pass

class DevoteeUpdate(DevoteeBase):
    pass

class Devotee(DevoteeBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

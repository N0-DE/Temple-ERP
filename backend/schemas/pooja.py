from pydantic import BaseModel
from typing import Optional

class PoojaBase(BaseModel):
    name: str
    description: Optional[str] = None
    amount: float
    duration_minutes: int = 30
    category: Optional[str] = None

class PoojaCreate(PoojaBase):
    pass

class PoojaUpdate(PoojaBase):
    pass

class Pooja(PoojaBase):
    id: int

    class Config:
        from_attributes = True

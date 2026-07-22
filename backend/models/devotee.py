from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Date
from datetime import datetime
from core.database import Base

class Devotee(Base):
    __tablename__ = "devotees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    phone = Column(String, index=True)
    address = Column(Text)
    date_of_birth = Column(Date, nullable=True)
    star = Column(String)
    nakshatra = Column(String)
    total_donations = Column(Float, default=0.0)
    
    # You can add relationship to bookings history later
    created_at = Column(DateTime, default=datetime.utcnow)

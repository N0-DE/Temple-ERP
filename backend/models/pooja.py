from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from core.database import Base

class Pooja(Base):
    __tablename__ = "poojas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text)
    amount = Column(Float, nullable=False)
    duration_minutes = Column(Integer, default=30)
    category = Column(String, index=True)
    
    # Bookings relationship
    # bookings = relationship("Booking", back_populates="pooja")

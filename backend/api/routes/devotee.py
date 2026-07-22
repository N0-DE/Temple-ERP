from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from core.database import SessionLocal
from models.devotee import Devotee
from schemas.devotee import DevoteeCreate, DevoteeUpdate, Devotee as DevoteeSchema
from api.deps import get_db, get_current_active_user
from models.user import User

router = APIRouter()

@router.post("/", response_model=DevoteeSchema)
def create_devotee(
    devotee_in: DevoteeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    devotee = Devotee(**devotee_in.model_dump())
    db.add(devotee)
    db.commit()
    db.refresh(devotee)
    return devotee

@router.get("/", response_model=List[DevoteeSchema])
def read_devotees(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    devotees = db.query(Devotee).offset(skip).limit(limit).all()
    return devotees

@router.get("/{devotee_id}", response_model=DevoteeSchema)
def read_devotee(
    devotee_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    devotee = db.query(Devotee).filter(Devotee.id == devotee_id).first()
    if not devotee:
        raise HTTPException(status_code=404, detail="Devotee not found")
    return devotee

@router.put("/{devotee_id}", response_model=DevoteeSchema)
def update_devotee(
    devotee_id: int,
    devotee_in: DevoteeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    devotee = db.query(Devotee).filter(Devotee.id == devotee_id).first()
    if not devotee:
        raise HTTPException(status_code=404, detail="Devotee not found")
    
    update_data = devotee_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(devotee, field, value)
        
    db.add(devotee)
    db.commit()
    db.refresh(devotee)
    return devotee

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from core.database import SessionLocal
from models.pooja import Pooja
from schemas.pooja import PoojaCreate, PoojaUpdate, Pooja as PoojaSchema
from api.deps import get_db, get_current_active_user
from models.user import User

router = APIRouter()

@router.post("/", response_model=PoojaSchema)
def create_pooja(
    pooja_in: PoojaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    pooja = Pooja(**pooja_in.model_dump())
    db.add(pooja)
    db.commit()
    db.refresh(pooja)
    return pooja

@router.get("/", response_model=List[PoojaSchema])
def read_poojas(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    poojas = db.query(Pooja).offset(skip).limit(limit).all()
    return poojas

@router.get("/{pooja_id}", response_model=PoojaSchema)
def read_pooja(
    pooja_id: int, db: Session = Depends(get_db)
):
    pooja = db.query(Pooja).filter(Pooja.id == pooja_id).first()
    if not pooja:
        raise HTTPException(status_code=404, detail="Pooja not found")
    return pooja

@router.put("/{pooja_id}", response_model=PoojaSchema)
def update_pooja(
    pooja_id: int,
    pooja_in: PoojaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    pooja = db.query(Pooja).filter(Pooja.id == pooja_id).first()
    if not pooja:
        raise HTTPException(status_code=404, detail="Pooja not found")
    
    update_data = pooja_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pooja, field, value)
        
    db.add(pooja)
    db.commit()
    db.refresh(pooja)
    return pooja

@router.delete("/{pooja_id}")
def delete_pooja(
    pooja_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    pooja = db.query(Pooja).filter(Pooja.id == pooja_id).first()
    if not pooja:
        raise HTTPException(status_code=404, detail="Pooja not found")
    db.delete(pooja)
    db.commit()
    return {"message": "Pooja deleted successfully"}

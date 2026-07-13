from pydantic import BaseModel
from typing import Optional
import time

# --- ADDED: SQLAlchemy Database Imports ---
from sqlalchemy import Column, String, Float, ForeignKey
# CRITICAL: Import your 'Base' from wherever you set up your database connection for user auth!
# (Usually, this is in a file named database.py)
from database import Base 



class Worker(BaseModel):
    worker_id: str
    ip: str
    cores: int
    ram: int

class Heartbeat(BaseModel):
    worker_id: Optional[str] = None
    hardware_id: Optional[str] = None
    display_name: Optional[str] = None
    os: Optional[str] = None
    cpu_cores: Optional[int] = None
    ram_gb: Optional[int] = None
    cpu_percent: Optional[float] = None
    ram_percent: Optional[float] = None
    gpu_percent: Optional[float] = None  # <-- Added for the Android UI
    timestamp: Optional[float] = None


# ----------------------------------------------------
# 2. SQLALCHEMY MODELS (Table Structure for the Database)
# ----------------------------------------------------
class Job(Base):
    __tablename__ = "jobs"

    job_id = Column(String, primary_key=True, index=True)
    
    # This securely links the job to the user who submitted it
    user_id = Column(String, ForeignKey("users.id")) 
    
    filename = Column(String)
    status = Column(String, default="queued")
    worker_id = Column(String, nullable=True)
    result = Column(String, nullable=True)
    error = Column(String, nullable=True)
    
    script_path = Column(String)
    data_path = Column(String, nullable=True)
    weights_path = Column(String, nullable=True)
    created_at = Column(Float, default=time.time)
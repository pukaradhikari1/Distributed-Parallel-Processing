from pydantic import BaseModel
from typing import Optional
import time
from sqlalchemy import Column, String, Float, Integer, ForeignKey
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
    gpu_percent: Optional[float] = None  
    timestamp: Optional[float] = None

class Job(Base):
    __tablename__ = "jobs"
    job_id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id")) 
    filename = Column(String)
    
    job_type = Column(String, default="standard") 
    total_shards = Column(Integer, default=1)
    
    status = Column(String, default="queued")
    worker_id = Column(String, nullable=True)
    result = Column(String, nullable=True)
    error = Column(String, nullable=True)
    script_path = Column(String)
    data_path = Column(String, nullable=True)
    weights_path = Column(String, nullable=True)
    created_at = Column(Float, default=time.time)

class JobShard(Base):
    __tablename__ = "job_shards"
    shard_id = Column(String, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("jobs.job_id"))
    worker_id = Column(String)
    shard_index = Column(Integer)
    status = Column(String, default="running")
    result = Column(String, nullable=True)
    error = Column(String, nullable=True)
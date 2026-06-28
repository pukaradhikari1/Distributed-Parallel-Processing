from pydantic import BaseModel
from typing import Optional


class Worker(BaseModel):
    worker_id: str
    ip: str
    cores: int
    ram: int


class Heartbeat(BaseModel):
    worker_id: Optional[str] = None

    # These fields are sent by the current worker.py
    hardware_id: Optional[str] = None
    display_name: Optional[str] = None
    os: Optional[str] = None
    cpu_cores: Optional[int] = None
    ram_gb: Optional[int] = None
    cpu_percent: Optional[float] = None
    ram_percent: Optional[float] = None
    gpu_percent: Optional[float] = None  # <-- Added for the Android UI
    timestamp: Optional[float] = None
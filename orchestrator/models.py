from pydantic import BaseModel

class Worker(BaseModel):
    worker_id: str
    ip: str
    cores: int
    ram: int

class Heartbeat(BaseModel):
    worker_id: str
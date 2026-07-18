import time
from models import WorkerNode

def register_worker(db, worker_data):
    worker_id = worker_data['worker_id']
    worker = db.query(WorkerNode).filter(WorkerNode.worker_id == worker_id).first()
    
    # Extract name and OS, default to safe fallbacks if missing
    w_name = worker_data.get('worker_name', 'Unknown') 
    w_os = worker_data.get('os', 'Unknown OS') # FIX: Capture OS from incoming payload
    
    if worker:
        worker.worker_name = w_name 
        worker.ip = worker_data['ip']
        worker.cores = worker_data['cores']
        worker.ram = worker_data['ram']
        worker.os = w_os            # FIX: Update OS if a node re-registers
        worker.status = 'online'
        worker.last_seen = time.time()
    else:
        worker = WorkerNode(
            worker_id=worker_id,
            worker_name=w_name, 
            ip=worker_data['ip'],
            cores=worker_data['cores'],
            ram=worker_data['ram'],
            os=w_os,                # FIX: Save OS on node creation
            status='online',
            last_seen=time.time()
        )
        db.add(worker)
    
    db.commit()

def update_heartbeat(db, heartbeat_data):
    worker_id = heartbeat_data.worker_id
    worker = db.query(WorkerNode).filter(WorkerNode.worker_id == worker_id).first()
    
    if worker:
        worker.last_seen = time.time()
        worker.status = 'online'
        
        if heartbeat_data.cpu_percent is not None:
            worker.cpu_percent = heartbeat_data.cpu_percent
        if heartbeat_data.ram_percent is not None:
            worker.ram_percent = heartbeat_data.ram_percent
        if getattr(heartbeat_data, 'gpu_percent', None) is not None:
            worker.gpu_percent = heartbeat_data.gpu_percent
            
        # Optional Guardrail: If OS hasn't been set yet, check if it's arriving in the heartbeat
        if hasattr(heartbeat_data, 'os') and heartbeat_data.os:
            worker.os = heartbeat_data.os
            
        db.commit()
        return True
    return False

def get_available_worker(db):
    worker = db.query(WorkerNode).filter(
        WorkerNode.status == 'online',
        WorkerNode.current_job == None
    ).order_by(WorkerNode.cpu_percent.asc()).first()
    
    return worker.worker_id if worker else None
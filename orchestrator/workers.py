import time

workers = {}

def register_worker(worker_data):
    worker_id = worker_data['worker_id']
    existing = workers.get(worker_id)

    workers[worker_id] = {
        'ip': worker_data['ip'],
        'cores': worker_data['cores'],
        'ram': worker_data['ram'],
        'status': 'online',
        'last_seen': time.time(),
        'current_job': existing['current_job'] if existing else None,
        'cpu_percent': existing['cpu_percent'] if existing else 0.0,
        'ram_percent': existing['ram_percent'] if existing else 0.0,
        'gpu_percent': existing['gpu_percent'] if existing else 0.0,
    }

def update_heartbeat(heartbeat_data):

    worker_id = heartbeat_data.worker_id
    
    if worker_id in workers:
        workers[worker_id]['last_seen'] = time.time()
        workers[worker_id]['status'] = 'online'
        
        # disp in ui 
        if heartbeat_data.cpu_percent is not None:
            workers[worker_id]['cpu_percent'] = heartbeat_data.cpu_percent
        if heartbeat_data.ram_percent is not None:
            workers[worker_id]['ram_percent'] = heartbeat_data.ram_percent
        if getattr(heartbeat_data, 'gpu_percent', None) is not None:
            workers[worker_id]['gpu_percent'] = heartbeat_data.gpu_percent
            
        return True
    return False

def get_available_worker():
    for worker_id, worker in workers.items():
        if worker['status'] == 'online' and worker['current_job'] is None:
            return worker_id
    return None
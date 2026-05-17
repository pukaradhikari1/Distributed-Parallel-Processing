import time

workers = {}

def register_worker(worker_data):
    workers[worker_data['worker_id']] = {
        'ip': worker_data['ip'],
        'cores': worker_data['cores'],
        'ram': worker_data['ram'],
        'status': 'online',
        'last_seen': time.time(),
        'current_job': None
    }

def update_heartbeat(worker_id):
    if worker_id in workers:
        workers[worker_id]['last_seen'] = time.time()
        workers[worker_id]['status'] = 'online'
        return True
    return False

def get_available_worker():
    for worker_id, worker in workers.items():
        if worker['status'] == 'online' and worker['current_job'] is None:
            return worker_id
    return None
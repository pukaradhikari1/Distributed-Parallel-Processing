import uuid
import platform
import grpc
import psutil
import time
import json
import os
import sys
import socket
import threading
from concurrent import futures

current_dir=os.path.dirname(os.path.abspath(__file__))
grpc_path=os.path.abspath(os.path.join(current_dir,"..","grpc_layer"))
sys.path.append(grpc_path)

import distributed_pb2
import distributed_pb2_grpc 

def get_identity():
    system_name = platform.system()
    if system_name == "Darwin":
        system_name = "macOS"
    elif system_name == "Linux" and "microsoft" in platform.release().lower():
        system_name = "WSL2"
    return{
        "hardware_id":hex(uuid.getnode()),
        "display_name":platform.node(),
        "os":system_name,
        "cpu_cores":psutil.cpu_count(logical=False),
        "ram_gb":int(psutil.virtual_memory().total/(1024**3))
    }

def get_vitals():
    return{
        "cpu_percent":psutil.cpu_percent(interval=1),
        "ram_percent":psutil.virtual_memory().percent,
        "timestamp":time.time()
    }

class WorkerService(distributed_pb2_grpc.WorkerServiceServicer):
    def ExecuteTask(self,request,context):
        print(f"[TASK] Recieved Job: {request.job_id} | Shard: {request.shard_index}")
        return distributed_pb2.TaskResult(
            job_id=request.job_id,
            worker_id=hex(uuid.getnode()),
            shard_index=request.shard_index,
            success=True,
            #implementation not done yet
            result="Task Successful"
        )
    
    def Heartbeat(self,request,context):
        print(f"Heartbeat checked\n")
        return distributed_pb2.HeartbeatResponse(acknowledged=True)

def register_with_orchestrator(orchestrator_ip):
    identity=get_identity()
    channel=grpc.insecure_channel(f'{orchestrator_ip}:50051')
    stub=distributed_pb2_grpc.OrchestratorServiceStub(channel)
    info=distributed_pb2.WorkerInfo(
        worker_id=identity["hardware_id"],
        ip=socket.gethostbyname(socket.gethostname()),
        cores=identity["cpu_cores"],
        ram=identity["ram_gb"]
    )
    try:
        response=stub.RegisterWorker(info)
        if response.ok:
            print(f"Sucessfully registered worker {identity['hardware_id']} with Orchestrator at {orchestrator_ip}")
    except Exception:
        print(f"Failed to register: {Exception}")

def serve():
    server=grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    distributed_pb2_grpc.add_OrchestratorServiceServicer_to_server(WorkerService(),server)
    server.add_insecure_port('[::]:50051')
    print("Worker grpc server starting on port 50051...\n ")
    server.start()

    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

def find_orchestrator():
    print("Searching for Orchestrator on the network...")
    client=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    client.setsockopt(socket.SOL_SOCKET,socket.SO_BROADCAST,1)
    client.bind(("",50005))
    client.settimeout(1.0)
    print("Searching for Orchestrator... (Press Ctrl+C to stop)")

    while True:
        try:
            data, addr = client.recvfrom(1024)
            message = data.decode()
    
            if message.startswith("ORCHESTRATOR:"):
                orchestrator_ip = message.split(":")[1]
                print(f"Discovered Orchestrator at: {orchestrator_ip}")
                return orchestrator_ip
        except socket.timeout:
            continue
        except KeyboardInterrupt:
            print("Searching for Orchestrator cancelled by user.")
            return None

if __name__=="__main__":
    identity=get_identity()
    print("worker identity: ")
    print(json.dumps(identity,indent=4))
    
    registered=False
    orchestrator_ip=""
    while not registered:
        orchestrator_ip=find_orchestrator()
        success = register_with_orchestrator(orchestrator_ip)
        if success:
            registered=True
        else:
            print("Registration failed. Retrying in 5 seconds...\n")
            time.sleep(5)

    server_thread=threading.Thread(target=serve,daemon=True)
    server_thread.start()
    print(f"Server started in background. Listening for tasks from {orchestrator_ip}...\n")
    
    print("Starting live monitoring...\n")
    try:
        print("Press Ctrl+C to stop monitoring.")
        while True:
            vitals=get_vitals()
            packet={**identity,**vitals}
            print(f"Reporting: CPU {packet['cpu_percent']}% | RAM {packet['ram_percent']}%\n")
            time.sleep(4)
    except KeyboardInterrupt:
        print("Worker stopped.")
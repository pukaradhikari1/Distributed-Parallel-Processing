"""
grpc_server.py

This runs on each WORKER laptop.
It listens for incoming gRPC calls from the orchestrator and executes
the received task.

Member 3 will plug in the real subprocess execution / ML training logic
inside ExecuteTask(). Right now it returns placeholder data so the
connection itself can be tested end-to-end first.
"""

import grpc
from concurrent import futures
import socket
import uuid
import platform
import requests
import grpc
import psutil
import time
import json
import os
import sys
import threading
import subprocess
import re

current_dir = os.path.dirname(os.path.abspath(__file__))
grpc_path = os.path.abspath(os.path.join(current_dir, "..", "grpc_layer"))
sys.path.append(grpc_path)

import distributed_pb2
import distributed_pb2_grpc

# Must stay comfortably under grpc_client.py's ExecuteTask timeout (3600s).
TASK_TIMEOUT_SECONDS = 3540  # 59 minutes

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

def get_local_ip():
    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8',80))
        ip=s.getsockname()[0]
    except Exception:
        ip='127.0.0.1'
    finally:
        s.close()
    return ip

def get_gpu_vitals():
    try:
        cmd="nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits"
        result=subprocess.check_output(cmd,shell=True).decode().strip()
        gpu_load,gpu_mem=result.split(',')
        return {"gpu_load":float(gpu_load),"gpu_mem":float(gpu_mem)}
    except:
        return {"gpu_load":0.0,"gpu_mem":0.0}
    
def get_vitals():
    gpu=get_gpu_vitals()
    return{
        "cpu_percent":psutil.cpu_percent(interval=None),
        "ram_percent":psutil.virtual_memory().percent,
        "gpu_percent":gpu["gpu_load"],
        "timestamp":time.time()
    }


class WorkerServiceServicer(distributed_pb2_grpc.WorkerServiceServicer):

    def __init__(self,hardware_id):
        self.worker_id = hardware_id

    def ExecuteTask(self, request, context):
        print(f"[grpc_server] Received job: {request.job_id}, shard: {request.shard_index}")
        print(f"[grpc_server] Script size: {len(request.script)} bytes")
        print(f"[grpc_server] Data shard size: {len(request.data_shard)} bytes")
        print(f"[grpc_server] Model weights size: {len(request.model_weights)} bytes")

        job_id=request.job_id
        shard_ind=request.shard_index

        print(f"[TASK] Recieved Job: {job_id} | Shard: {shard_ind}\n")
        
        script_file=f"task_{job_id}_{shard_ind}.py"
        data_file=f"data_{job_id}_{shard_ind}.bin"
        weight_file=f"weights_{job_id}_{shard_ind}.bin"

        with open(script_file,"wb") as file:
            file.write(request.script)
        
        with open(data_file,"wb") as file:
            file.write(request.data_shard)
          
        with open(weight_file,"wb") as file:
            file.write(request.model_weights)

        try:
            result=subprocess.run([sys.executable,script_file,data_file,weight_file],
                                  capture_output=True,
                                  text=True,
                                  timeout=TASK_TIMEOUT_SECONDS)
            
            loss_val=0.0
            try:
                match=re.search(r"LOSS:\s*([\d.]+)",result.stdout,re.IGNORECASE)
                if match:
                    loss_val=float(match.group(1))
            except:
                pass

            if result.returncode==0:
                print(f"[SUCCESS] Shard {shard_ind} completed.")
                return distributed_pb2.TaskResult(job_id=request.job_id,
                                                  worker_id=hex(uuid.getnode()),
                                                  shard_index=shard_ind,
                                                  success=True,
                                                  result_data=result.stdout.encode(),
                                                  error_message="",
                                                  loss=loss_val)
            else:
                print(f"[ERROR] Shard {shard_ind} unsuccessful.")
                return distributed_pb2.TaskResult(job_id=request.job_id,
                                                  worker_id=hex(uuid.getnode()),
                                                  shard_index=shard_ind,
                                                  success=False,
                                                  result_data=b"",
                                                  error_message=result.stderr,
                                                  loss=loss_val) 
        except subprocess.TimeoutExpired:
            print(f"[TIMEOUT] Shard {shard_ind} timed out.")
            return distributed_pb2.TaskResult(job_id=request.job_id,
                                              worker_id=hex(uuid.getnode()),
                                              shard_index=shard_ind,
                                              success=False,
                                              result_data=b"",
                                              error_message="Task timed out.",
                                              loss=loss_val)
        except Exception as e:
            return distributed_pb2.TaskResult(job_id=request.job_id,
                                              worker_id=hex(uuid.getnode()),
                                              shard_index=shard_ind,
                                              success=False,
                                              result_data=b"",
                                              error_message=str(e),
                                              loss=loss_val)
        finally:
            if os.path.exists(script_file):
                os.remove(script_file)
            if os.path.exists(data_file):
                os.remove(data_file)
            if os.path.exists(weight_file):
                os.remove(weight_file)
    
    def Heartbeat(self,request,context):
        print(f"Heartbeat checked\n")
        return distributed_pb2.HeartbeatResponse(acknowledged=True)

def find_orchestrator():
    client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    client.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    client.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    client.bind(("", 50005))
    client.settimeout(1.0)
    print("Searching for Orchestrator signal...", end="")
    while True:
        try:
            print(".", end="", flush=True)
            data, addr = client.recvfrom(1024)
            msg = data.decode()
            if msg.startswith("ORCHESTRATOR:"):
                ip=msg.split(":")[1]
                print(f"Found Orchestrator at {ip}")
                return ip
        except socket.timeout: 
            continue
        
def register_with_orchestrator(orchestrator_ip):
    identity=get_identity()
    
    # REST API Payload matching the Orchestrator's 'Worker' model
    payload = {
        "worker_id": identity["hardware_id"],
        "ip": get_local_ip(),
        "worker_name": identity["display_name"],
        "cores": identity["cpu_cores"],
        "ram": identity["ram_gb"]
    }
    
    try:
        register_url = f"http://{orchestrator_ip}:8000/register-worker"
        response = requests.post(register_url, json=payload, timeout=100)
        if response.status_code == 200:
            print(f"Successfully registered worker {identity['hardware_id']} with Orchestrator!")
            return True
        return False
    except Exception as e:
        print(f"Failed to connect to Orchestrator for registration: {e}")
        return False

def serve(hardware_id):
    MAX_MESSAGE_LENGTH=500*1024*1024
    options=[('grpc.max_send_message_length', MAX_MESSAGE_LENGTH),
             ('grpc.max_receive_message_length', MAX_MESSAGE_LENGTH)]
    
    server=grpc.server(futures.ThreadPoolExecutor(max_workers=10),options=options)
    servicer=WorkerServiceServicer(hardware_id)
    distributed_pb2_grpc.add_WorkerServiceServicer_to_server(servicer,server)
    distributed_pb2_grpc.add_OrchestratorServiceServicer_to_server(OrchestratorServiceServicer(),server)
    server.add_insecure_port('[::]:50051')
    server.start()
    print("Worker grpc server starting on port 50051...\n ")
    return server

    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

class OrchestratorServiceServicer(distributed_pb2_grpc.OrchestratorServiceServicer):
    """
    Only needed if the WORKER also needs to receive registration calls.
    In most setups registration goes the other way (worker -> orchestrator),
    so this is here for completeness / future use.
    """

    def RegisterWorker(self, request, context):
        print(f"[grpc_server] RegisterWorker called with: {request.worker_id}")
        return distributed_pb2.Ack(ok=True)

if __name__=="__main__":
    identity=get_identity()
    print("worker identity: ")
    print(json.dumps(identity,indent=4))
    
    worker_server=serve(identity["hardware_id"])
    print("gRPC server started successfully.")

    try:
        while True:
            orchestrator_ip=find_orchestrator()##
            if orchestrator_ip:
                if register_with_orchestrator(orchestrator_ip):
                    print(f"Monitoring vitals...\n")
                
                    try:
                        while True:
                            vitals = get_vitals()
                            packet = {"worker_id": identity["hardware_id"],
                                      "cpu_percent": vitals["cpu_percent"],
                                      "ram_percent": vitals["ram_percent"],
                                      "gpu_percent": vitals["gpu_percent"]}                       
                            heartbeat_url = f"http://{orchestrator_ip}:8000/heartbeat"
                            response = requests.post(heartbeat_url, json=packet, timeout=10)
                        
                            if response.status_code == 200:
                                print(f"[200 OK] Orchestrator: {orchestrator_ip} | CPU: {vitals['cpu_percent']}% | RAM: {vitals['ram_percent']}%  | GPU: {vitals['gpu_percent']}%    ", end="\r", flush=True)
                            else:
                                print(f"\n[!] Server error {response.status_code}. Re-discovering...")
                                break
                            time.sleep(4)
                    except KeyboardInterrupt:
                        print("Worker stopping...\n")
                        sys.exit(0)
                    except Exception as e:
                        print(f"Connection lost to Orchestrator: {e}")
                        print("Retrying...\n")
                        time.sleep(5)
                        break
            else:
                print("Orchestrator not found. Retrying...\n")
                time.sleep(2)
    except (KeyboardInterrupt,SystemExit):
        print("Stopping Worker...")
        worker_server.stop(0)
        print("Exiting.")
        os._exit(0)
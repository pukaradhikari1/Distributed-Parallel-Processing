import uuid
import platform
import requests
import grpc
import psutil
import time
import json
import os
import sys
import socket
import threading
import subprocess
import re
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
        "cpu_percent":psutil.cpu_percent(interval=1),
        "ram_percent":psutil.virtual_memory().percent,
        "gpu_percent":gpu["gpu_load"],
        "timestamp":time.time()
    }

class WorkerService(distributed_pb2_grpc.WorkerServiceServicer):
    def ExecuteTask(self,request,context):
        job_id=request.job_id
        shard_ind=request.shard_index
        script_code=request.script
        input_data=request.data_shard
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
                                  timeout=30)
            
            loss_val=0.0
            try:
                match=re.search(r"LOSS:\s*([\d.])+)",result.stdout,re.IGNORECASE)
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

def get_local_ip():
    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    try:
        s.connect('8.8.8.8',80)
        ip=s.getsockname()[0]
    except Exception:
        ip='127.0.0.1'
    finally:
        s.close()
    return ip

def register_with_orchestrator(orchestrator_ip):
    identity=get_identity()
    channel=grpc.insecure_channel(f'{orchestrator_ip}:50060')
    stub=distributed_pb2_grpc.OrchestratorServiceStub(channel)
    info=distributed_pb2.WorkerInfo(
        worker_id=identity["hardware_id"],
        ip=get_local_ip(),
        cores=identity["cpu_cores"],
        ram=identity["ram_gb"]
    )
    try:
        response=stub.RegisterWorker(info)
        if response.ok:
            print(f"Sucessfully registered worker {identity['hardware_id']} with Orchestrator at {orchestrator_ip}")
            return True
    except Exception as e:
        print(f"Failed to register: {e}")
        return False

def serve():
    server=grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    distributed_pb2_grpc.add_WorkerServiceServicer_to_server(WorkerService(),server)
    server.add_insecure_port('[::]:50052')
    print("Worker grpc server starting on port 50052...\n ")
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
    
    server_thread=threading.Thread(target=serve,daemon=True)
    server_thread.start()

    while True:
        orchestrator_ip=find_orchestrator()
        if orchestrator_ip:
            if register_with_orchestrator(orchestrator_ip):
                print(f"Monitoring vitals...\n")
                
                try:
                    while True:
                        vitals = get_vitals()
                        packet = {**identity, **vitals}                       
                        heartbeat_url = f"http://{orchestrator_ip}:8000/heartbeat"
                        response = requests.post(heartbeat_url, json=packet, timeout=2)
                        
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
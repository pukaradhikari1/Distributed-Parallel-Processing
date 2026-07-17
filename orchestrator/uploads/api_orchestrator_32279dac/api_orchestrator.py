import grpc
from concurrent import futures
import time
import threading
import socket
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

import cluster_pb2
import cluster_pb2_grpc

# ==========================================
# 1. SHARED STATE MEMORY MAP
# ==========================================
active_workers = {}

# ==========================================
# 2. gRPC MASTER SERVER (Telemetry Ingestion)
# ==========================================
class MasterOrchestratorServicer(cluster_pb2_grpc.MasterOrchestratorServicer):
    def StreamHeartbeat(self, request_iterator, context):
        peer = context.peer()
        print(f"\n[gRPC Core] Channel connected: {peer}")
        try:
            for vitals in request_iterator:
                # Update global dictionary for the FastAPI UI to read
                active_workers[vitals.worker_id] = {
                    "cpu": vitals.cpu_utilization,
                    "ram": vitals.ram_utilization,
                    "ip": context.peer().split(":")[1], # Extract IP from ipv4:127.0.0.1:port
                    "status": "free",
                    "last_seen": time.time()
                }
                yield cluster_pb2.MasterCommand(command_type="NOP", target_workload_id="", execution_parameters="")
        except Exception:
            print(f"[gRPC Core] Connection lost for {peer}")

def run_grpc_server():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=5))
    cluster_pb2_grpc.add_MasterOrchestratorServicer_to_server(MasterOrchestratorServicer(), server)
    server.add_insecure_port('0.0.0.0:50050')
    server.start()
    server.wait_for_termination()

# ==========================================
# 3. UDP DISCOVERY BEACON
# ==========================================
def run_udp_broadcast():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    
    # Use loopback for local testing, change to 0.0.0.0 for physical LAN
    msg = f"ORCHESTRATOR:127.0.0.1".encode('utf-8')
    while True:
        try:
            s.sendto(msg, ('127.0.0.1', 50005))
        except Exception:
            pass
        time.sleep(3)

# ==========================================
# 4. FASTAPI WEB SERVER (The UI Bridge)
# ==========================================
app = FastAPI(title="Orchestrator REST API Bridge")

# Allow React/Expo UI to connect without CORS errors
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class WorkloadRequest(BaseModel):
    job_name: str
    script: str
    target_worker_id: str

@app.get("/api/cluster/vitals")
def get_cluster_vitals():
    """UI Polling Endpoint: Returns active workers for the Dashboard."""
    return {"status": "success", "workers": active_workers}

@app.post("/api/workloads/dispatch")
def dispatch_workload_from_ui(payload: WorkloadRequest):
    """UI Submission Endpoint: Triggers gRPC dispatch to the specific worker."""
    if payload.target_worker_id not in active_workers:
        raise HTTPException(status_code=404, detail="Target worker is offline or invalid")
    
    # In a real environment, you'd use the actual worker IP from active_workers[id]['ip']
    # For local loopback testing, we hardcode the known worker port 50051
    worker_address = "127.0.0.1:50051"
    
    try:
        print(f"[FastAPI] UI requested dispatch for '{payload.job_name}'. Forwarding via gRPC...")
        
        channel = grpc.insecure_channel(worker_address)
        stub = cluster_pb2_grpc.WorkerNodeStub(channel)
        
        grpc_payload = cluster_pb2.WorkloadPayload(
            job_id=f"job-{int(time.time())}",
            job_name=payload.job_name,
            script_bytes=payload.script.encode('utf-8'),
            shard_index=0,
            cluster_ips=["127.0.0.1"]
        )
        
        # Dispatch the payload synchronously via gRPC
        response = stub.DispatchShard(grpc_payload)
        
        return {
            "status": "success",
            "job_id": response.job_id,
            "worker_response": response.status_message,
            "execution_success": response.success
        }
    except grpc.RpcError as e:
        raise HTTPException(status_code=500, detail=f"gRPC Dispatch Failed: {e.details()}")

# ==========================================
# 5. BOOTSTRAP ALL SYSTEMS
# ==========================================
if __name__ == "__main__":
    # Spin up internal cluster systems
    threading.Thread(target=run_grpc_server, daemon=True).start()
    threading.Thread(target=run_udp_broadcast, daemon=True).start()
    
    print("=" * 60)
    print("ORCHESTRATOR ONLINE: FastAPI + gRPC + UDP Enabled")
    print("=" * 60)
    
    # Run API server for the UI on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)

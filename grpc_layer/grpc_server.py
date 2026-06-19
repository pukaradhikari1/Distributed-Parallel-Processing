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
import concurrent.futures
import socket

import distributed_pb2
import distributed_pb2_grpc


class WorkerServiceServicer(distributed_pb2_grpc.WorkerServiceServicer):

    def __init__(self):
        # Use the laptop's hostname as this worker's identity
        self.worker_id = socket.gethostname()

    def ExecuteTask(self, request, context):
        print(f"[grpc_server] Received job: {request.job_id}, shard: {request.shard_index}")
        print(f"[grpc_server] Script size: {len(request.script)} bytes")
        print(f"[grpc_server] Data shard size: {len(request.data_shard)} bytes")
        print(f"[grpc_server] Model weights size: {len(request.model_weights)} bytes")

        try:
            # ──────────────────────────────────────────────
            # PLACEHOLDER LOGIC
            # Member 3 replaces this block with:
            #   1. write request.script to a temp .py file
            #   2. write request.data_shard and request.model_weights to temp files
            #   3. run the script in an isolated subprocess with a timeout
            #   4. read back the updated weights / gradients and loss value
            # ──────────────────────────────────────────────
            result_data = b"placeholder_updated_weights"
            loss_value = 0.0
            success = True
            error_message = ""

        except Exception as e:
            result_data = b""
            loss_value = 0.0
            success = False
            error_message = str(e)

        return distributed_pb2.TaskResult(
            job_id=request.job_id,
            worker_id=self.worker_id,
            shard_index=request.shard_index,
            result_data=result_data,
            success=success,
            error_message=error_message,
            loss=loss_value
        )

    def Heartbeat(self, request, context):
        print(f"[grpc_server] Heartbeat received for {request.worker_id}")
        return distributed_pb2.HeartbeatResponse(acknowledged=True)


class OrchestratorServiceServicer(distributed_pb2_grpc.OrchestratorServiceServicer):
    """
    Only needed if the WORKER also needs to receive registration calls.
    In most setups registration goes the other way (worker -> orchestrator),
    so this is here for completeness / future use.
    """

    def RegisterWorker(self, request, context):
        print(f"[grpc_server] RegisterWorker called with: {request.worker_id}")
        return distributed_pb2.Ack(ok=True)


def serve(port=50051):
    server = grpc.server(concurrent.futures.ThreadPoolExecutor(max_workers=4))

    distributed_pb2_grpc.add_WorkerServiceServicer_to_server(
        WorkerServiceServicer(), server
    )
    distributed_pb2_grpc.add_OrchestratorServiceServicer_to_server(
        OrchestratorServiceServicer(), server
    )

    server.add_insecure_port(f"[::]:{port}")
    server.start()
    print(f"[grpc_server] Worker gRPC server running on port {port}")
    print(f"[grpc_server] Worker ID (hostname): {socket.gethostname()}")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()

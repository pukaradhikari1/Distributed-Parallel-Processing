"""
grpc_client.py

This runs on the ORCHESTRATOR side.
It is used to SEND a task (script + data shard + model weights) to a
worker laptop over gRPC, and receive the TaskResult back.

Member 1 will import send_task_to_worker() into main.py and call it
whenever a job needs to be dispatched to a worker.
"""

import grpc
import distributed_pb2
import distributed_pb2_grpc


def send_task_to_worker(worker_ip, job_id, shard_index, script_bytes,
                         data_bytes, model_weights_bytes=b""):
    """
    Sends a task to a single worker via gRPC.

    Args:
        worker_ip: IP address of the worker laptop (e.g. "192.168.1.11")
        job_id: unique job identifier (string)
        shard_index: which shard this is (string or int)
        script_bytes: the .py training script as raw bytes
        data_bytes: the data shard as raw bytes
        model_weights_bytes: current model weights as raw bytes (optional)

    Returns:
        TaskResult object if successful, None if the worker failed/timed out
    """
    channel = grpc.insecure_channel(f"{worker_ip}:50051")
    stub = distributed_pb2_grpc.WorkerServiceStub(channel)

    payload = distributed_pb2.TaskPayload(
        job_id=job_id,
        shard_index=str(shard_index),
        script=script_bytes,
        data_shard=data_bytes,
        model_weights=model_weights_bytes
    )

    try:
        result = stub.ExecuteTask(payload, timeout=120)
        return result

    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            print(f"[grpc_client] Worker {worker_ip} timed out (job {job_id}, shard {shard_index})")
        elif e.code() == grpc.StatusCode.UNAVAILABLE:
            print(f"[grpc_client] Worker {worker_ip} is offline/unreachable (job {job_id}, shard {shard_index})")
        else:
            print(f"[grpc_client] gRPC error from {worker_ip}: {e.code()} - {e.details()}")
        return None

    finally:
        channel.close()


def send_heartbeat_check(worker_ip, worker_id, timeout=5):
    """
    Sends a heartbeat ping to a worker to check if it's alive.
    Returns True if acknowledged, False otherwise.
    """
    channel = grpc.insecure_channel(f"{worker_ip}:50051")
    stub = distributed_pb2_grpc.WorkerServiceStub(channel)

    request = distributed_pb2.HeartbeatRequest(worker_id=worker_id)

    try:
        response = stub.Heartbeat(request, timeout=timeout)
        return response.acknowledged
    except grpc.RpcError:
        return False
    finally:
        channel.close()


# ── Simple manual test ──
# Run this file directly to test against a locally running grpc_server.py
if __name__ == "__main__":
    print("Testing gRPC client against localhost worker...")

    test_script = b"print('hello from training script')"
    test_data = b"1,2,3,4,5,6,7,8,9,10"
    test_weights = b"fake_model_weights_bytes"

    result = send_task_to_worker(
        worker_ip="127.0.0.1",
        job_id="test-job-001",
        shard_index=0,
        script_bytes=test_script,
        data_bytes=test_data,
        model_weights_bytes=test_weights
    )

    if result:
        print("Success:", result.success)
        print("Worker ID:", result.worker_id)
        print("Result data:", result.result_data)
        print("Loss:", result.loss)
        print("Error message:", result.error_message)
    else:
        print("No result returned — worker may be offline or timed out.")

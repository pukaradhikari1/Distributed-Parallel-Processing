import os
import sys
import grpc

current_dir = os.path.dirname(os.path.abspath(__file__))
grpc_path = os.path.abspath(os.path.join(current_dir, "..", "grpc_layer"))
sys.path.append(grpc_path)

import distributed_pb2 #type: ignore
import distributed_pb2_grpc  # type: ignore


def send_task_to_worker(worker_ip, job_id, shard_index, script_bytes, data_bytes, model_weights_bytes=b""):
    
    # 500MB Limit for ML Weights
    MAX_MESSAGE_LENGTH = 500 * 1024 * 1024
    options = [
        ('grpc.max_send_message_length', MAX_MESSAGE_LENGTH),
        ('grpc.max_receive_message_length', MAX_MESSAGE_LENGTH)
    ]

  
    channel = grpc.insecure_channel(f"{worker_ip}:50051", options=options)
    stub = distributed_pb2_grpc.WorkerServiceStub(channel)

    payload = distributed_pb2.TaskPayload(
        job_id=job_id,
        shard_index=str(shard_index),
        script=script_bytes,
        data_shard=data_bytes,
        model_weights=model_weights_bytes
    )

    try:
      
        result = stub.ExecuteTask(payload, timeout=300)
        return result

    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            print(f"[grpc_client] Worker {worker_ip} timed out (job {job_id}, shard {shard_index})")
        elif e.code() == grpc.StatusCode.UNAVAILABLE:
            print(f"[grpc_client] Worker {worker_ip} is offline/unreachable")
        else:
            print(f"[grpc_client] gRPC error: {e.details()}")
        return None
    finally:
        channel.close()
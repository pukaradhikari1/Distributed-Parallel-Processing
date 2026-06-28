import os
import sys
import grpc

current_dir = os.path.dirname(os.path.abspath(__file__))
grpc_path = os.path.abspath(os.path.join(current_dir, "..", "grpc_layer"))
sys.path.append(grpc_path)

import distributed_pb2
import distributed_pb2_grpc


def send_task_to_worker(worker_address, job_id, shard_index, script_bytes, data_bytes, weight_bytes):
    channel = grpc.insecure_channel(worker_address)
    stub = distributed_pb2_grpc.WorkerServiceStub(channel)

    # Added model_weights to match the new worker.py expectations
    payload = distributed_pb2.TaskPayload(
        job_id=job_id,
        shard_index=str(shard_index),
        script=script_bytes,
        data_shard=data_bytes,
        model_weights=weight_bytes
    )

    response = stub.ExecuteTask(payload, timeout=30)

    return response
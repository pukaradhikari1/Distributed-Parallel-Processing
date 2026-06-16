import os
import sys
import grpc

current_dir = os.path.dirname(os.path.abspath(__file__))
grpc_path = os.path.abspath(os.path.join(current_dir, "..", "grpc_layer"))
sys.path.append(grpc_path)

import distributed_pb2
import distributed_pb2_grpc


def send_task_to_worker(worker_address, job_id, shard_index, script_bytes, data_bytes):
    channel = grpc.insecure_channel(worker_address)
    stub = distributed_pb2_grpc.WorkerServiceStub(channel)

    payload = distributed_pb2.TaskPayload(
        job_id=job_id,
        shard_index=str(shard_index),
        script=script_bytes,
        data_shard=data_bytes
    )

    response = stub.ExecuteTask(payload, timeout=20)

    return response
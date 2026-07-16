import os
# we need to run KERAS 2 due to a compatibility bug between TF 2.16+ and KERAS 3
os.environ["TF_USE_LEGACY_KERAS"] = "1"

import json
import tensorflow as tf
import numpy as np

# 0. set gpu undetectable so multiple workers don't try to capture the same device
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

# 1. Initialize the Strategy
# TensorFlow reads OS environment variables automatically when this is called.
strategy = tf.distribute.MultiWorkerMirroredStrategy()

# 2. Scale your batch size by the number of workers
per_worker_batch_size = 64
num_workers = strategy.num_replicas_in_sync
global_batch_size = per_worker_batch_size * num_workers

# 3. Load and prepare data
def get_dataset():
    (x_train, y_train), _ = tf.keras.datasets.mnist.load_data()
    x_train = x_train / np.float32(255)
    y_train = y_train.astype(np.int64)
    
    # Repeat and batch. TensorFlow automatically shards the dataset among workers!
    return tf.data.Dataset.from_tensor_slices((x_train, y_train))\
        .shuffle(60000).repeat().batch(global_batch_size)


# 4. Define and Compile the Model inside the Strategy Scope
with strategy.scope():
    train_dataset = get_dataset()

    model = tf.keras.Sequential([
        tf.keras.layers.InputLayer(input_shape=(28, 28)),
        tf.keras.layers.Reshape(target_shape=(28, 28, 1)),
        tf.keras.layers.Conv2D(32, 3, activation='relu'),
        tf.keras.layers.Flatten(),
        tf.keras.layers.Dense(128, activation='relu'),
        tf.keras.layers.Dense(10)
    ])
    
    model.compile(
        loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        optimizer=tf.keras.optimizers.SGD(learning_rate=0.001),
        metrics=['accuracy']
    )
    # 5. Train the model
    print(f"Worker starting training...")
    model.fit(train_dataset, epochs=3, steps_per_epoch=70)

    # 6. DISTRIBUTED MODEL SAVING
    
    # Grab the current worker's configuration info from the strategy
    task_type = strategy.cluster_resolver.task_type
    task_id = strategy.cluster_resolver.task_id

    # Determine if this specific running script is the "Chief" (index 0)
    is_chief = (task_type == 'worker' and task_id == 0) or task_type is None

    base_filepath = "./my_distributed_model.keras"

    if is_chief:
        # The Chief writes straight to the real path
        save_path = base_filepath
        print(f"Chief saving final model to: {save_path}")
    else:
        # Non-chief workers write to an isolated temporary folder
        save_path = f"./temp_worker_{task_id}"
        os.makedirs(save_path, exist_ok=True)
        save_path = os.path.join(save_path, "model.keras")
        print(f"Worker {task_id} saving to temporary path...")

    # ALL workers must call this line simultaneously to sync variables
    model.save(save_path)

    # Clean up: Clean up the non-chief temporary directories so they don't clutter your disk
    if not is_chief:
        import shutil
        shutil.rmtree(os.path.dirname(save_path))
        print(f"Worker {task_id} cleaned up temporary files.")


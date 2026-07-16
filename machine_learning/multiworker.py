import json
import os
import sys
# 0. set gpu undetectable so multiple workers don't try to capture the same device 
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
# we need to run KERAS 2 due to a compatibility bug between TF 2.16+ and KERAS 3
os.environ["TF_USE_LEGACY_KERAS"] = "1"

import tensorflow as tf
import numpy as np

# Initialising strategy
strategy = tf.distribute.MultiWorkerMirroredStrategy()

# Scaling batch size by number of workers
per_worker_batch_size = 16
num_workers = strategy.num_replicas_in_sync
global_batch_size = per_worker_batch_size * num_workers

def get_dataset():
    # Path to extracted PlantVillage directory
    data_dir = "./archive/PlantVillage" 
    
    # 1. Efficiently stream images from disk
    dataset = tf.keras.utils.image_dataset_from_directory(
        data_dir,
        labels="inferred",
        label_mode="int",          # Match SparseCategoricalCrossentropy
        image_size=(224, 224),     # Resize target
        batch_size=global_batch_size,
        shuffle=True
    )
    
    # 2. Add an explicit Rescaling layer mapping [0, 255] to [0, 1]
    # (Replaces the old manual numpy devision x_train / 255)
    normalization_layer = tf.keras.layers.Rescaling(1./255)
    dataset = dataset.map(lambda x, y: (normalization_layer(x), y))
    
    # 3. Optimize memory with prefetching and infinite repetition
    # tf.data.AUTOTUNE tells CPU to prepare batch N+1 while GPU trains batch N
    dataset = dataset.repeat().prefetch(buffer_size=tf.data.AUTOTUNE)
    return dataset


total_images = 20654-15
steps_per_epoch = total_images // global_batch_size

with strategy.scope():
    IMAGE_SIZE = (224,224)
    train_dataset = get_dataset()
    model = tf.keras.Sequential([
        tf.keras.layers.InputLayer(input_shape = (IMAGE_SIZE[0], IMAGE_SIZE[1], 3)),

        # Simple CNN layers
        tf.keras.layers.Conv2D(32, 3, activation = 'relu'),
        tf.keras.layers.MaxPooling2D(),
        tf.keras.layers.Flatten(),
        tf.keras.layers.Dense(128, activation = 'relu'),
        tf.keras.layers.Dense(15)
    ])

    model.compile(
        loss = tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        optimizer = tf.keras.optimizers.SGD(learning_rate = 0.001),
        metrics = ['accuracy']
    )
    model.fit(train_dataset, epochs=10, steps_per_epoch = steps_per_epoch)

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


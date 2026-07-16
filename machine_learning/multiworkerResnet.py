import json
import os
import sys
# 0. set gpu undetectable so multiple workers don't try to capture the same device
# remove following line if on real distributed system with a gpu on each worker 
#os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
# we need to run KERAS 2 due to a compatibility bug between TF 2.16+ and KERAS 3
os.environ["TF_USE_LEGACY_KERAS"] = "1"

import tensorflow as tf
import numpy as np

# Initialising strategy
strategy = tf.distribute.MultiWorkerMirroredStrategy()

# Scaling batch size by number of workers
per_worker_batch_size = 64
num_workers = strategy.num_replicas_in_sync
global_batch_size = per_worker_batch_size * num_workers
IMAGE_SIZE = (224,224)
EPHOCHS_INITIAL = 8
EPOCHS_FINE_TUNE = 12


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
    normalization_layer = tf.keras.layers.Rescaling(1./255)
    dataset = dataset.map(lambda x, y: (normalization_layer(x), y))
    
    # 3. Optimize memory with prefetching and infinite repetition
    # tf.data.AUTOTUNE tells CPU to prepare batch N+1 while GPU trains batch N
    dataset = dataset.repeat().prefetch(buffer_size=tf.data.AUTOTUNE)
    return dataset


total_images = 20654-15
steps_per_epoch = total_images // global_batch_size

with strategy.scope():

    train_dataset = get_dataset()
    num_classes = 15

    data_augmentation = tf.keras.Sequential([
        tf.keras.layers.RandomFlip("horizontal"),
        tf.keras.layers.RandomZoom(0,1)
    ])

    base_model = tf.keras.applications.ResNet50(
        weights = "imagenet",
        include_top = False,
        input_shape = (224,224,3)
    )

    base_model.trainable = False

    preprocess = tf.keras.applications.resnet50.preprocess_input

    inputs = tf.keras.Input(shape=(224,224,3))
    x = data_augmentation(inputs)
    x = preprocess(x)
    x = base_model(x,training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    outputs = tf.keras.layers.Dense(num_classes, activation=None)(x)

    model = tf.keras.Model(inputs,outputs)

    model.compile(
        loss = tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        optimizer = tf.keras.optimizers.Adam(1e-3),
        metrics = [tf.keras.SparseCategoricalAccuracy()]
    )

    print("\nPhase 1: Training Classifier")
    model.fit(train_dataset, epochs=10, steps_per_epoch = steps_per_epoch)

    base_model.trainable = True

    for layer in base_model.layers[:-30]:
        layer.trainable = False

    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-5),
        loss = tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics = [tf.keras.SparseCategoricalAccuracy()]
    )

    print("\nPhase 2: Fine Tuning")
    model.fit(
        train_dataset,
        epochs = EPOCHS_FINE_TUNE,
        steps_per_epoch=steps_per_epoch
    )
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


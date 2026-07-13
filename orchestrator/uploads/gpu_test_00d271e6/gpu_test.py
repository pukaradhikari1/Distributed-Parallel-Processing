import tensorflow as tf

print("--- STARTING HARDWARE CHECK ---")
gpus = tf.config.list_physical_devices('GPU')

if gpus:
    print(f"[SUCCESS] TensorFlow found {len(gpus)} GPU(s)!")
    for gpu in gpus:
        print(f"Details: {gpu}")
else:
    print("[WARNING] No GPU detected. TensorFlow is using the CPU.")
print("--- CHECK COMPLETE ---")
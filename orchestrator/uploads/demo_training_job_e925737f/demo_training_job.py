# demo_training_job.py
#
# A tiny standalone "training" job for demoing the DistributedDashboard
# pipeline end-to-end: upload this file via the app's Python Script picker
# on the WorkloadInputScreen, submit it, and watch it get dispatched to a
# worker and show up on the Output screen.
#
# It doesn't need any external libraries or GPU access — it just simulates
# a few epochs of "training" with fake loss/accuracy numbers so there's
# something concrete to point at during a demo.

import time
import random

EPOCHS = 5


def fake_train_epoch(epoch: int):
    """Simulates one epoch of training and returns (loss, accuracy)."""
    # Loss trends down, accuracy trends up, with a little random noise —
    # just enough to look like a real training curve.
    loss = max(0.05, 1.0 - (epoch * 0.18) + random.uniform(-0.05, 0.05))
    accuracy = min(0.99, 0.5 + (epoch * 0.09) + random.uniform(-0.02, 0.02))
    return loss, accuracy


def main():
    print("=" * 50)
    print("DistributedDashboard demo job starting")
    print("=" * 50)

    results = []
    for epoch in range(1, EPOCHS + 1):
        loss, accuracy = fake_train_epoch(epoch)
        results.append({"epoch": epoch, "loss": round(loss, 4), "accuracy": round(accuracy, 4)})
        print(f"Epoch {epoch}/{EPOCHS} — loss: {loss:.4f}, accuracy: {accuracy:.4f}")
        time.sleep(1)  # simulate work being done, and gives the demo a visible pace

    print("-" * 50)
    print("Training complete.")
    print(f"Final loss: {results[-1]['loss']}")
    print(f"Final accuracy: {results[-1]['accuracy']}")
    print("=" * 50)


if __name__ == "__main__":
    main()

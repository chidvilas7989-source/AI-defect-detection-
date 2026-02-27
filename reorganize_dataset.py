"""
reorganize_dataset.py
=====================
Splits the DeepPCB dataset into two flat binary folders:

  data/good/   — defect-free template images (*temp.jpg) (label: 0)
  data/bad/    — defective tested images     (*test.jpg) (label: 1)

Source
------
  DeepPCB/PCBData/

After running you will find:
  data/good/good_0001.jpg … good_NNNN.jpg
  data/bad/bad_0001.jpg  … bad_MMMM.jpg
  data/dataset_split.json        (metadata)
"""

import os
import shutil
import json
from pathlib import Path

BASE     = Path(__file__).parent
DATA     = BASE / "data"
DEEP_PCB = DATA / "DeepPCB" / "PCBData"
GOOD_DIR = DATA / "good"
BAD_DIR  = DATA / "bad"


def main():
    print("=" * 60)
    print("  PCB Dataset Reorganiser – Good / Bad Binary Split")
    print("=" * 60)

    if not DEEP_PCB.exists():
        print(f"❌ Error: DeepPCB dataset not found at {DEEP_PCB}")
        return

    # Clear existing folders
    for d in [GOOD_DIR, BAD_DIR]:
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True, exist_ok=True)

    good_imgs = list(DEEP_PCB.rglob("*temp.jpg"))
    bad_imgs  = list(DEEP_PCB.rglob("*test.jpg"))

    print(f"  Found {len(good_imgs)} template (GOOD) circuit images.")
    print(f"  Found {len(bad_imgs)} tested (BAD) circuit images.")

    # ── Copy GOOD images ────────────────────────────────────────────
    print("\n  Copying GOOD images …")
    for idx, src in enumerate(good_imgs, start=1):
        dst = GOOD_DIR / f"good_{idx:05d}.jpg"
        shutil.copy2(str(src), str(dst))

    # ── Copy BAD images ─────────────────────────────────────────────
    print("  Copying BAD  images …")
    for idx, src in enumerate(bad_imgs, start=1):
        dst = BAD_DIR / f"bad_{idx:05d}.jpg"
        shutil.copy2(str(src), str(dst))

    # ── Verify ───────────────────────────────────────────────────
    n_good = len(list(GOOD_DIR.glob("*.jpg")))
    n_bad  = len(list(BAD_DIR.glob("*.jpg")))

    print(f"\n  ✅ data/good/ → {n_good} images")
    print(f"  ✅ data/bad/  → {n_bad}  images")

    # ── Write metadata ───────────────────────────────────────────
    meta = {
        "dataset": "DeepPCB",
        "split": {
            "good": n_good,
            "bad":  n_bad,
            "total": n_good + n_bad,
        },
        "good_dir": str(GOOD_DIR),
        "bad_dir":  str(BAD_DIR),
        "source":   str(DEEP_PCB),
    }
    meta_path = DATA / "dataset_split.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\n  📄 Metadata saved → {meta_path}")
    print("=" * 60)
    print("  Done! You can now run: python cnn_lstm_train.py")
    print("=" * 60)


if __name__ == "__main__":
    main()

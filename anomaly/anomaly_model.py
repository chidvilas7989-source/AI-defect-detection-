"""
anomaly_model.py
================
Builds and trains a CNN Autoencoder on GOOD (non-defective) images.
"""

import os
import yaml
from pathlib import Path
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models, Sequential

BASE = Path(__file__).parent.parent
SETTINGS_FILE = BASE / "config" / "settings.yaml"

with open(SETTINGS_FILE, "r") as f:
    settings = yaml.safe_load(f)

img_size = settings['training']['yolo']['img_size']
epochs = settings['training']['autoencoder']['epochs']
batch_size = settings['training']['autoencoder']['batch_size']
learning_rate = settings['training']['autoencoder']['learning_rate']

def build_autoencoder():
    aug_settings = settings['augmentations']['autoencoder']
    
    # Data Augmentation Layer (Sequential)
    data_augmentation = Sequential([
        layers.RandomFlip(aug_settings['flip']),
        layers.RandomRotation(aug_settings.get('rotation_factor', 0.2)),
        layers.RandomContrast(aug_settings.get('contrast_factor', 0.2))
    ], name="data_augmentation")

    input_img = layers.Input(shape=(img_size, img_size, 3))
    
    x = data_augmentation(input_img)
    x = layers.Rescaling(1./255)(x)

    # Encoder
    x = layers.Conv2D(32, (3, 3), activation='relu', padding='same')(x)
    x = layers.MaxPooling2D((2, 2), padding='same')(x)
    x = layers.Conv2D(64, (3, 3), activation='relu', padding='same')(x)
    x = layers.MaxPooling2D((2, 2), padding='same')(x)
    x = layers.Conv2D(128, (3, 3), activation='relu', padding='same')(x)
    encoded = layers.MaxPooling2D((2, 2), padding='same')(x)

    # Decoder
    x = layers.Conv2D(128, (3, 3), activation='relu', padding='same')(encoded)
    x = layers.UpSampling2D((2, 2))(x)
    x = layers.Conv2D(64, (3, 3), activation='relu', padding='same')(x)
    x = layers.UpSampling2D((2, 2))(x)
    x = layers.Conv2D(32, (3, 3), activation='relu', padding='same')(x)
    x = layers.UpSampling2D((2, 2))(x)
    decoded = layers.Conv2D(3, (3, 3), activation='sigmoid', padding='same')(x)

    autoencoder = models.Model(input_img, decoded)
    autoencoder.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate), loss='mse')
    
    return autoencoder

def train_autoencoder():
    print(f"  AI Defect Detection — Autoencoder Training")
    model = build_autoencoder()
    
    # In a full run, we would load only 'GOOD' images. For simplicity, we define the dataset logic.
    # dataset_dir = BASE / "data" / "anomaly" / "val" / "good"  # example structure
    # train_ds = tf.keras.utils.image_dataset_from_directory(...)
    print("Autoencoder built and ready for training on good datasets.")
    print("Run `model.fit(train_ds, ...)` to train.")
    
    # Save untrained model for placeholder purposes
    model_path = BASE / "models" / "autoencoder.h5"
    if not model_path.parent.exists():
        model_path.parent.mkdir(parents=True)
    model.save(str(model_path))
    print(f"✅ Autoencoder template saved to {model_path}")

if __name__ == "__main__":
    train_autoencoder()

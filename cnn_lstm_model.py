"""
cnn_lstm_model.py
=================
CNN + LSTM model for binary defect classification.

Architecture
------------
  Input image (3 x H x W)
       │
  MobileNetV3-Small (ImageNet pretrained) — feature extractor
       │  → 576-dim pooled feature vector per frame
       │
  Reshape to sequence  [batch, seq_len, 576]
       │
  LSTM (hidden=256, num_layers=2, bidirectional=False, dropout=0.3)
       │  → takes last hidden state [batch, 256]
       │
  Dropout(0.4)
       │
  FC(256 → 128) → ReLU
  FC(128 → 1)   → Sigmoid
       │
  P(defective) ∈ [0, 1]

For MVP single-image upload: seq_len = 1.
For production camera stream: pass seq_len > 1 frames as a tensor.
"""

import torch
import torch.nn as nn
from torchvision import models


class CNNLSTM(nn.Module):
    """
    CNN backbone (MobileNetV3-Small) + LSTM head binary classifier.

    Parameters
    ----------
    hidden_size  : LSTM hidden units               (default 256)
    num_layers   : LSTM stacked layers             (default 2)
    dropout      : dropout probability             (default 0.3)
    pretrained   : load ImageNet weights for CNN   (default True)
    """

    def __init__(
        self,
        hidden_size: int = 256,
        num_layers:  int = 2,
        dropout:     float = 0.3,
        pretrained:  bool = True,
    ):
        super().__init__()

        # ── CNN Backbone ─────────────────────────────────────────────
        weights = (
            models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
            if pretrained else None
        )
        backbone = models.mobilenet_v3_small(weights=weights)

        # Remove classifier; keep feature extractor up to avg-pool
        self.cnn = nn.Sequential(
            backbone.features,
            backbone.avgpool,          # → [B, 576, 1, 1]
            nn.Flatten(),              # → [B, 576]
        )
        cnn_out_dim = 576

        # ── LSTM ─────────────────────────────────────────────────────
        self.lstm = nn.LSTM(
            input_size  = cnn_out_dim,
            hidden_size = hidden_size,
            num_layers  = num_layers,
            batch_first = True,
            dropout     = dropout if num_layers > 1 else 0.0,
        )

        # ── Classifier head ──────────────────────────────────────────
        self.head = nn.Sequential(
            nn.Dropout(p=0.4),
            nn.Linear(hidden_size, 128),
            nn.ReLU(inplace=True),
            nn.Linear(128, 1),
            nn.Sigmoid(),
        )

    # ── Forward pass ─────────────────────────────────────────────────
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Parameters
        ----------
        x : torch.Tensor
            Shape [batch, seq_len, C, H, W]  — sequence of frames
            OR    [batch, C, H, W]           — single frame (seq_len=1 added automatically)

        Returns
        -------
        torch.Tensor  shape [batch, 1]  — probability of being defective
        """
        if x.dim() == 4:                # single image → add seq dim
            x = x.unsqueeze(1)

        B, T, C, H, W = x.shape

        # Extract CNN features for every frame in the sequence
        x = x.view(B * T, C, H, W)     # [B*T, C, H, W]
        feats = self.cnn(x)             # [B*T, 576]
        feats = feats.view(B, T, -1)    # [B, T, 576]

        # LSTM over the sequence
        lstm_out, _ = self.lstm(feats)  # [B, T, hidden]
        last_hidden  = lstm_out[:, -1, :]  # [B, hidden]

        out = self.head(last_hidden)    # [B, 1]
        return out


# ── Convenience constructor ───────────────────────────────────────────────────
def build_model(pretrained: bool = True) -> CNNLSTM:
    """Return a freshly initialised CNNLSTM model."""
    return CNNLSTM(
        hidden_size = 256,
        num_layers  = 2,
        dropout     = 0.3,
        pretrained  = pretrained,
    )


if __name__ == "__main__":
    model = build_model()
    # Quick sanity check: single image
    dummy = torch.randn(2, 3, 224, 224)        # batch=2, single frame
    out   = model(dummy)
    print(f"✅ Model output shape (single frame): {out.shape}")  # [2, 1]

    # Sequence of 5 frames
    dummy_seq = torch.randn(2, 5, 3, 224, 224)
    out_seq   = model(dummy_seq)
    print(f"✅ Model output shape (5-frame seq) : {out_seq.shape}")  # [2, 1]

    total_params = sum(p.numel() for p in model.parameters())
    train_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\n  Total parameters      : {total_params:,}")
    print(f"  Trainable parameters  : {train_params:,}")

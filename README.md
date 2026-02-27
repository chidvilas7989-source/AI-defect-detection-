# 🤖 AI-Powered Automated Defect Detection System

**Team:** NULL VECTORS  
**Hackathon:** CONCURRENECE-RIPPLE2K26  
**Tech Stack:** YOLOv8 + Flask + HTML/CSS/JS

---

## 📋 Project Overview

Real-time defect detection system using YOLOv8 deep learning to automatically detect and classify manufacturing defects (cracks, scratches, dents) in component images.

### Key Features
- ✅ Real-time defect detection with YOLOv8
- ✅ Web-based interface for easy image upload
- ✅ Automatic Pass/Fail quality decision
- ✅ Annotated result visualization
- ✅ REST API for integration

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.10 or higher
- 16 GB RAM (minimum 8 GB)
- pip package manager

### 2. Installation

```bash
# Clone or extract the project
cd ai-defect-detection

# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Add Your Trained Model

**IMPORTANT:** Place your trained YOLOv8 weights file in the `models/` directory:

```
ai-defect-detection/
  └── models/
      └── best.pt    # <-- Your trained model goes here
```

If you don't have a trained model yet, the system will use a pretrained YOLOv8n model as fallback for demo purposes.

### 4. Run the Application

```bash
python app.py
```

The server will start at: **http://localhost:5000**

### 5. Usage
1. Open http://localhost:5000 in your browser
2. Click "Choose Image" and select a component image
3. Click "Detect Defects" button
4. View results: annotated image + Pass/Fail status + defect list

---

## 📁 Project Structure

```
ai-defect-detection/
├── app.py                 # Flask server + API endpoints
├── model_service.py       # YOLOv8 model loading + inference
├── requirements.txt       # Python dependencies
├── README.md             # This file
├── models/
│   └── best.pt           # Your trained YOLOv8 weights (add this!)
├── static/
│   ├── style.css         # Frontend styling
│   └── script.js         # Frontend JavaScript
├── templates/
│   └── index.html        # Main web interface
└── data/
    └── sample/           # Place test images here
```

---

## 🔧 API Endpoints

### 1. Home Page
- **URL:** `GET /`
- **Description:** Serves the web interface

### 2. Detect Defects
- **URL:** `POST /api/detect`
- **Input:** Form-data with 'image' field (image file)
- **Output:** JSON response
  ```json
  {
    "status": "PASS" or "FAIL",
    "defects": [
      {
        "class": "crack",
        "confidence": 0.87,
        "bbox": [x1, y1, x2, y2]
      }
    ],
    "confidence": 0.87,
    "annotated_image": "base64_encoded_image"
  }
  ```

### 3. Health Check
- **URL:** `GET /health`
- **Output:** `{"status": "healthy"}`

---

## 🎯 Training Your Own Model

### Data Preparation (150 images)

1. **Collect & Label Images:**
   - Use Roboflow, LabelImg, or CVAT
   - Export in YOLO format
   - Classes: crack, scratch, dent (or your classes)

2. **Dataset Structure:**
   ```
   dataset/
   ├── images/
   │   ├── train/
   │   └── val/
   └── labels/
       ├── train/
       └── val/
   ```

3. **Create data.yaml:**
   ```yaml
   train: path/to/images/train
   val: path/to/images/val
   nc: 3  # number of classes
   names: ['crack', 'scratch', 'dent']
   ```

### Training Command

```python
from ultralytics import YOLO

# Load pretrained YOLOv8-nano
model = YOLO('yolov8n.pt')

# Train on your dataset
model.train(
    data='data.yaml',
    epochs=30,
    imgsz=640,
    batch=16,
    name='defect_detection'
)
```

After training, copy `runs/detect/defect_detection/weights/best.pt` to `models/best.pt`

---

## 🌐 Deploy to Render

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit - AI Defect Detection"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 2: Deploy on Render
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Environment:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python app.py`
5. Click "Create Web Service"

### Step 3: Access Your App
- Render will provide a URL like: `https://your-app.onrender.com`

---

## 💡 Tips & Troubleshooting

### Model not found error?
- Ensure `best.pt` is in `models/` directory
- System will use pretrained YOLOv8n as fallback

### Slow inference on CPU?
- YOLOv8-nano is optimized for CPU
- Consider reducing image size in `model_service.py`
- For production, use GPU-enabled hosting

### Port already in use?
- Change port in `app.py`: `app.run(port=8000)`

### Dependencies installation issues?
- Use Python 3.10 or 3.11 (best compatibility)
- For PyTorch issues, visit: https://pytorch.org/get-started/locally/

---

## 📊 Project Methodology

1. **Data Collection:** 150 annotated defect images (70/20/10 split)
2. **Model:** YOLOv8-nano (lightweight, real-time capable)
3. **Training:** 30-40 epochs with data augmentation
4. **Deployment:** Flask web app + REST API
5. **Hardware:** Works on i5 CPU + 16GB RAM

---

## 👥 Team NULL VECTORS

- A GAGAN
- T CHIDVILAS BHAGAVAN
- R BHANU PRAKASH
- K PAVANITHA

---

## 📝 License

This project was developed for CONCURRENECE-RIPPLE2K26 hackathon.

---

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review YOLOv8 documentation: https://docs.ultralytics.com/
3. Flask documentation: https://flask.palletsprojects.com/

---

**Built with ❤️ by Team NULL VECTORS**

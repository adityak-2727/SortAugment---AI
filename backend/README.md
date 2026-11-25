# SortAugment AI: Recyclable Material Image Augmenter - Backend

SortAugment AI is a high-performance Python/FastAPI backend designed for recycling facility engineers. It addresses classification model degradation caused by sorting-line variations in **lighting**, **contamination**, and **material physical condition**.

The backend provides:
1. **Classical Data Augmentation**: 14 domain-specific transforms scaled by continuous intensity (0.0–1.0).
2. **ResNet-18 Classifier Inference**: Robustness evaluation and prediction drift tracking on uploaded materials.
3. **Generative Image Augmentation**: Stable Diffusion XL (SDXL 1.0 fp16) with smart CPU offloading and VAE slicing fitting within 8 GB VRAM (RTX 4060 Laptop GPU), featuring automatic sequential offload and SD 1.5 fallback.
4. **Historical Evaluation Gallery**: Instant browsing and filtering across 1,620 pre-generated SDXL experimental images and original TrashNet source samples.
5. **Research Evaluation Results**: Normalized benchmarking metrics across TrashNet and TACO test sets with confidence intervals and analytical figures.
6. **Dataset Export**: Streamed ZIP packaging formatted for instant downstream model retraining.

---

## 1. System Architecture

```
SortAugment Workspace Architecture
│
├── assets/                          # Static dataset and research artifacts
│   ├── best_model.pt                # ResNet-18 model weights (512 -> 6 classes)
│   ├── config.json                  # Class names, dimensions, generation config
│   ├── prompt_bank.json             # SDXL domain prompts and negative prompts
│   ├── results.csv / summary.md     # Research evaluation metrics and caveats
│   ├── figures/                     # Analytical evaluation plots (.png)
│   ├── tables/                      # gen_quality_scores.csv, eval_main.csv
│   ├── trashnet/                    # Source TrashNet dataset images (dataset-resized)
│   └── generated/                   # 1,620 pre-generated SDXL images
│
├── backend/                         # FastAPI backend application
│   ├── app/
│   │   ├── config.py                # Paths, limits, classes, environment config
│   │   ├── errors.py                # Contract-compliant error responses
│   │   ├── schemas.py               # Pydantic v2 schemas strictly matching CONTRACT.md
│   │   ├── main.py                  # FastAPI entry point, CORS, static routes
│   │   ├── ml/
│   │   │   ├── classifier.py        # ResNet18 PyTorch loader & softmax inference
│   │   │   ├── effects.py           # 14 pure NumPy/OpenCV classical transforms
│   │   │   └── generator.py         # SDXL img2img/inpaint engine + GPU memory manager
│   │   ├── routes/
│   │   │   ├── health.py            # GET /api/health
│   │   │   ├── effects.py           # GET /api/effects
│   │   │   ├── augment.py           # POST /api/augment
│   │   │   ├── jobs.py              # GET/POST /api/jobs, /jobs/{id}, cancel
│   │   │   ├── classify.py          # POST /api/classify
│   │   │   ├── gallery.py           # GET /api/gallery
│   │   │   ├── generate.py          # POST /api/generate
│   │   │   └── results.py           # GET /api/results
│   │   └── services/
│   │       ├── upload.py            # EXIF rotation, Pillow check, sanitize, resize
│   │       ├── jobs.py              # ThreadPoolExecutor (augment) & GPU Queue (generate)
│   │       ├── gallery.py           # CSV mapping of 1,620 generated + TrashNet images
│   │       ├── results.py           # Metric parsing with exact caveats from summary.md
│   │       └── export.py            # In-memory streaming ZIP builder with manifest.csv
│   ├── data/jobs/                   # Persistent runtime job storage (<job_id>/)
│   ├── tests/                       # 228 automated pytest unit and integration tests
│   ├── requirements.txt             # Windows dependency specification
│   └── start-backend.bat            # Automated launch script
│
├── CONTRACT.md                      # Verbatim API Contract v1
├── MANUAL_STEPS.md                  # Test report, live benchmarks, and verification guide
└── start-backend.bat                # Root launcher forwarding to backend/start-backend.bat
```

---

## 2. Requirements & Windows Setup

### Hardware & Operating System
- **OS**: Windows 10/11 (64-bit)
- **GPU**: NVIDIA RTX GPU (e.g. RTX 4060 Laptop GPU with 8 GB VRAM) recommended for live generation; CPU supported for classical augmentation and classifier inference.
- **Python**: Python 3.10, 3.11, or 3.12 (64-bit) installed and added to your `PATH`.

### Step 1: Install PyTorch with CUDA Support
PyTorch **must not** be installed from standard PyPI if GPU acceleration is required.
1. Visit the official PyTorch installation selector: **[https://pytorch.org/get-started/locally/](https://pytorch.org/get-started/locally/)**
2. Choose:
   - **PyTorch Build**: Stable
   - **Your OS**: Windows
   - **Package**: Pip
   - **Language**: Python
   - **Compute Platform**: CUDA (choose the version matching your NVIDIA driver, e.g., CUDA 12.x or 11.x)
3. Copy and run the command in your virtual environment. For example:
   ```powershell
   venv\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
   ```

### Step 2: Install Remaining Backend Dependencies
```powershell
cd d:\SortAugment\backend
venv\Scripts\pip install -r requirements.txt
```

### Step 3: Run the Backend
Double-click `start-backend.bat` in the workspace root or run:
```powershell
.\start-backend.bat
```
The server will start on `http://127.0.0.1:8000`.

---

## 3. Classical Augmentation Effects & Intensity Scaling

The 14 classical augmentation transforms ported from Section 4 of `SortAugment_AI.ipynb` operate on RGB `uint8` images with a NumPy RNG.

> **Note on Albumentations vs. NumPy:** In the original research notebook, Albumentations was used where available, with NumPy fallbacks. To ensure maximum stability and cross-platform reproducibility on Windows without dependency conflicts, our backend uses optimized pure NumPy and OpenCV implementations. An `intensity` parameter (0.0 to 1.0) continuously scales the distortion:
> - `intensity = 0.0`: Near identity / minimal perceptible alteration.
> - `intensity = 0.5`: Approximates the notebook's default research parameters.
> - `intensity = 1.0`: Maximum stress-testing distortion (~2× notebook strength).

### Canonical Effects Table

| Axis | Effect ID | Description | Scaling Parameter (0.0 → 1.0) |
| :--- | :--- | :--- | :--- |
| **lighting** | `brightness_contrast` | Simulates sorting-line lamp variability and shadows | Factor ranges from 0.0 (identity) to ±0.45 brightness and ±0.45 contrast |
| **lighting** | `shadow` | Diagonal synthetic shadow polygon across conveyor | Shadow opacity scales from 0.0 to 0.75 |
| **lighting** | `color_temperature` | Shift between cool blue (fluorescent) and warm yellow | Channel offset delta scales from 0 to ±45 |
| **lighting** | `low_light` | Low illumination with amplification Poisson noise | Darkening factor scales from 1.0 down to 0.15; noise scales up |
| **lighting** | `glare` | Specular reflection highlight on glossy materials (plastic/metal) | Highlight intensity scales up to 1.0; radius from 0 to 45% of image |
| **contamination** | `noise` | Sensor and conveyor dust grain (Gaussian + speckle) | Noise standard deviation ($\sigma$) scales from 0 to 45.0 |
| **contamination** | `blur` | Belt motion and camera defocus | Gaussian blur kernel size scales from $k=1$ (none) up to $k=21$ |
| **contamination** | `occlusion_patches` | Overlapping debris / sorting line clutter | Number of patches scales 0..5; patch size scales up to 25% |
| **contamination** | `stain_overlay` | Organic food liquid and oil splatters | Splatter count scales 0..6; opacity scales from 0.0 to 0.85 |
| **condition** | `rotation` | Arbitrary item orientation on conveyor | Rotation angle bound scales from $\pm 0^\circ$ up to $\pm 180^\circ$ |
| **condition** | `perspective` | Off-axis camera angles and chute drop perspective | Corner jitter displacement scales from 0% up to 22% of dimension |
| **condition** | `elastic` | Local stretch and warping (flexible plastics/paper) | Alpha parameter scales from 0 to 75.0 |
| **condition** | `crumple` | Crushed cans, crumpled paper, and deformed plastic bottles | Gradient shading frequency and amplitude scale up to 0.45 |
| **condition** | `partial_crop` | Partial conveyor boundary framing | Crop margin scales from 0% up to 35% of image width/height |

---

## 4. Complete API Endpoint Reference & PowerShell Examples

All API routes are served under `http://localhost:8000/api`. Errors strictly return HTTP 4xx/5xx with `{"error":{"code":"string","message":"string"}}`.

### 1. Health Check
Check model loading status, class names, GPU availability, and live generation readiness.

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/health" -Method Get | ConvertTo-Json -Depth 5
```
**Sample Output:**
```json
{
  "status": "ok",
  "model_loaded": true,
  "classes": ["cardboard", "glass", "metal", "paper", "plastic", "trash"],
  "gpu": {
    "available": true,
    "name": "NVIDIA GeForce RTX 4060 Laptop GPU",
    "vram_gb": 8.0
  },
  "live_generation": {
    "available": true,
    "reason": null
  }
}
```

---

### 2. Effects Catalog
Retrieve available augmentation axes and effect descriptors.

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/effects" -Method Get | ConvertTo-Json -Depth 5
```

---

### 3. Create Classical Augmentation Job (`POST /api/augment`)
Submits 1 to 50 images for CPU-bound classical augmentation.

```powershell
$form = @{
    files = Get-Item "d:\SortAugment\assets\trashnet\dataset-resized\plastic\plastic1.jpg"
    axes = '["lighting", "contamination"]'
    effects = '["low_light", "noise", "stain_overlay"]'
    intensity = "0.6"
    variants_per_image = "3"
    seed = "42"
    labels = '{"plastic1.jpg": "plastic"}'
}
$response = Invoke-RestMethod -Uri "http://localhost:8000/api/augment" -Method Post -Form $form
$response | ConvertTo-Json
$jobId = $response.job_id
```

---

### 4. List All Jobs (`GET /api/jobs`)
Retrieve high-level summaries of all background jobs.

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/jobs" -Method Get | ConvertTo-Json -Depth 4
```

---

### 5. Check Job Status & Progress (`GET /api/jobs/{job_id}`)
Poll job progress, ETA, and retrieve generated variant URLs.

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/jobs/$jobId" -Method Get | ConvertTo-Json -Depth 6
```
**Sample Output:**
```json
{
  "job_id": "8b51d6bb-e11a-42c2-8495-2c81daae015c",
  "type": "augment",
  "status": "done",
  "progress": { "done": 3, "total": 3 },
  "eta_seconds": null,
  "error": null,
  "result": {
    "sources": [
      {
        "source_id": "992db1f0-21a4-4f01-b552-3eef6db52844",
        "name": "plastic1.jpg",
        "label": "plastic",
        "url": "/files/jobs/8b51d6bb-e11a-42c2-8495-2c81daae015c/originals/plastic1.jpg",
        "variants": [
          {
            "variant_id": "3be8c4e4-7cb6-4c4c-834c-6fa10657c79e",
            "url": "/files/jobs/8b51d6bb-e11a-42c2-8495-2c81daae015c/variants/plastic1_var1.jpg",
            "axis": "lighting",
            "effect": "low_light",
            "params": { "intensity": 0.6, "darken_factor": 0.49 }
          }
        ]
      }
    ]
  }
}
```

---

### 6. Cancel a Running Job (`POST /api/jobs/{job_id}/cancel`)
Gracefully cancel any queued or in-progress job.

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/jobs/$jobId/cancel" -Method Post | ConvertTo-Json
```

---

### 7. Classify Job Variants (`POST /api/classify`)
Run the ResNet-18 classifier across all originals and generated variants in a finished job. Computes prediction shift and class probabilities.

```powershell
$body = @{ job_id = $jobId } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8000/api/classify" -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 6
```

---

### 8. Historical Generation Gallery (`GET /api/gallery`)
Browse the 1,620 pre-generated SDXL images matched against original TrashNet sources.

```powershell
# Filter by class 'plastic', axis 'lighting', 5 items per page
Invoke-RestMethod -Uri "http://localhost:8000/api/gallery?cls=plastic&axis=lighting&page=1&page_size=5" -Method Get | ConvertTo-Json -Depth 5
```

---

### 9. Create Generative AI Job (`POST /api/generate`)
Queue GPU-accelerated SDXL generation (img2img and inpainting).

```powershell
$form = @{
    files = Get-Item "d:\SortAugment\assets\trashnet\dataset-resized\plastic\plastic1.jpg"
    axis = "contamination"
    strength = "0.45"
    variants_per_image = "1"
}
$genResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/generate" -Method Post -Form $form
$genResponse | ConvertTo-Json
```

---

### 10. Research Benchmark Results (`GET /api/results`)
Returns normalized model evaluations (TrashNet, TACO with 95% CIs, robustness breakdown) and verbatim caveats from research summary.

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/results" -Method Get | ConvertTo-Json -Depth 6
```

---

### 11. Export Dataset ZIP (`GET /api/jobs/{job_id}/export`)
Downloads a retrain-ready ZIP containing `<label>/<source>_<variant>.jpg` and `manifest.csv`.

```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/jobs/$jobId/export?include_originals=true" -OutFile "dataset_export.zip"
```

---

### 12. Retrieve Static Files (`GET /files/...`)
Fetch any job artifact, original image, or research figure safely:

```powershell
Invoke-WebRequest -Uri "http://localhost:8000/files/figures/fig1_samples.png" -OutFile "fig1.png"
```

---

## 5. Security & Production Hygiene

- **Loopback Binding**: Configured to listen on `127.0.0.1:8000`.
- **Strict CORS**: Requests are only accepted from `http://localhost:5173`.
- **Path Traversal Protection**: Static `/files/` endpoint validates that all resolved file paths remain strictly inside whitelisted subdirectories (`backend/data/jobs`, `assets/figures`, `assets/generated`, `assets/trashnet`).
- **Upload Hardening**: Enforces MIME and extension whitelisting (`jpg`, `jpeg`, `png`, `webp`), a 20 MB size limit, a maximum of 50 files per request, PIL image integrity verification, automatic EXIF orientation normalization, and sanitization of filenames.
- **Old Job Cleanup**: Automatic background pruning removes job folders older than 24 hours to prevent disk saturation.

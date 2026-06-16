# Airport Gate Compliance Analyzer

A web application and analysis tool to measure gate equipment compliance (FGP, PCA, PBB) for flight operations.

---

## Getting Started

### 1. Prerequisites
Ensure you have Python 3.8+ installed on your system.

### 2. Installation
Navigate to the project root directory and install the required Python dependencies:
```powershell
pip install -r requirements.txt
```

---

## Running the Server

The server is built using FastAPI. When the server starts up, it automatically initializes the SQLite database and hosts both the backend APIs and the static frontend UI.

### Option A: Standard Command
```powershell
uvicorn Back_end.main:app --reload
```

### Option B: Run via Python Module (recommended if `uvicorn` is not in your PATH)
```powershell
python -m uvicorn Back_end.main:app --reload
```

Once running, open your browser and navigate to:
* **Web Interface**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
* **API Documentation (Swagger UI)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## Additional Commands

### Database Initialization
If you want to manually reset or pre-populate the database from the existing `Back_end/BMS.csv` or regenerate mock data, run:
```powershell
python -m Back_end.database
```
*If `BMS.csv` is not present, mock data will be generated inside the `data/` directory.*

### Standalone Local Analysis Script
To run the analysis locally and export the results to `summary.csv` without running the server, run:
```powershell
python intern.py
```

---

## Project Structure

* **`Back_end/`**
  * `main.py`: FastAPI server logic, API endpoints, and static file serving.
  * `database.py`: Database schema setup, CSV parsing, and database initialization.
  * `BMS.csv`: Source gate usage data.
* **`Front_end/`**
  * `index.html`: Main HTML user interface.
  * `style.css`: UI styling.
  * `script.js`: Frontend API interaction and dynamic rendering.
* **`intern.py`**: Standalone analysis script.
* **`requirements.txt`**: List of dependencies.

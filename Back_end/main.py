from fastapi import FastAPI, Query, UploadFile, File, Form
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import pymysql
from sqlalchemy import create_engine
import pandas as pd
from pathlib import Path
import io
import urllib.parse
from Back_end.database import init_db, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

def get_engine():
    encoded_password = urllib.parse.quote_plus(DB_PASSWORD)
    return create_engine(f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}/{DB_NAME}")

def get_connection():
    return pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)

app = FastAPI(title="Airport Gate Compliance Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/analyze")
def analyze(threshold: float = Query(70.0, description="Compliance threshold percentage")):
    try:
        engine = get_engine()
        df = pd.read_sql_query("SELECT * FROM flight_meter_usage", engine)
        
        if df.empty:
            return {
                "stats": {
                    "total_gates": 0,
                    "total_flights": 0,
                    "flagged_gates": 0,
                    "compliant_gates": 0,
                    "compliance_rate": 0.0
                },
                "gates": []
            }
            
        flight_usage = pd.crosstab(
            [df['METER_LOCATION'], df['FLIGHT_NUMBER']],
            df['METER_TYPE']
        ).reset_index()
        
        for meter in ['FGP', 'PCA', 'PBB']:
            if meter not in flight_usage.columns:
                flight_usage[meter] = 0
                
        flight_usage[['FGP', 'PCA', 'PBB']] = (flight_usage[['FGP', 'PCA', 'PBB']] > 0).astype(int)
        
        summary = flight_usage.groupby('METER_LOCATION').agg(
            Total_Flights=('FLIGHT_NUMBER', 'count'),
            FGP_Used=('FGP', 'sum'),
            PCA_Used=('PCA', 'sum'),
            PBB_Used=('PBB', 'sum')
        ).reset_index()
        
        summary['FGP_Pct'] = (summary['FGP_Used'] / summary['Total_Flights'] * 100).round(1)
        summary['PCA_Pct'] = (summary['PCA_Used'] / summary['Total_Flights'] * 100).round(1)
        summary['PBB_Pct'] = (summary['PBB_Used'] / summary['Total_Flights'] * 100).round(1)
        
        summary['Is_Flagged'] = (
            (summary['FGP_Pct'] < threshold) | 
            (summary['PCA_Pct'] < threshold) | 
            (summary['PBB_Pct'] < threshold)
        )
        
        total_gates = len(summary)
        total_flights = int(summary['Total_Flights'].sum())
        flagged_gates = int(summary['Is_Flagged'].sum())
        compliant_gates = total_gates - flagged_gates
        compliance_rate = round((compliant_gates / total_gates * 100), 1) if total_gates > 0 else 0
        
        gates_data = []
        for _, row in summary.iterrows():
            gates_data.append({
                "gate": row['METER_LOCATION'],
                "flights": int(row['Total_Flights']),
                "fgp_pct": float(row['FGP_Pct']),
                "pca_pct": float(row['PCA_Pct']),
                "pbb_pct": float(row['PBB_Pct']),
                "is_flagged": bool(row['Is_Flagged'])
            })
            
        return {
            "stats": {
                "total_gates": total_gates,
                "total_flights": total_flights,
                "flagged_gates": flagged_gates,
                "compliant_gates": compliant_gates,
                "compliance_rate": compliance_rate
            },
            "gates": gates_data
        }
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/sample")
def sample():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW CREATE TABLE flight_meter_usage")
        schema = cursor.fetchone()[1]
        
        cursor.execute("SELECT * FROM flight_meter_usage LIMIT 50")
        rows = cursor.fetchall()
        conn.close()
        
        insert_stmts = []
        for row in rows:
            formatted_vals = [f"'{str(v).replace('\'', '\'\'')}'" if isinstance(v, str) else str(v) for v in row]
            insert_stmts.append(f"INSERT INTO flight_meter_usage VALUES ({', '.join(formatted_vals)});")
            
        dump = f"-- Schema\n{schema};\n\n-- Sample Data Dump\n" + "\n".join(insert_stmts)
        return PlainTextResponse(dump)
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), mode: str = Form("replace")):
    try:
        contents = await file.read()
        filename = file.filename.lower()
        
        try:
            if filename.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith('.json'):
                df = pd.read_json(io.BytesIO(contents))
            elif filename.endswith(('.xls', '.xlsx')):
                df = pd.read_excel(io.BytesIO(contents))
            elif filename.endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(contents))
            elif filename.endswith(('.txt', '.tsv')):
                # Try to sniff separator for txt/tsv
                df = pd.read_csv(io.BytesIO(contents), sep=None, engine='python')
            else:
                # Fallback: try parsing as CSV
                df = pd.read_csv(io.BytesIO(contents))
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": f"Could not parse file: {str(e)}"})
        
        expected_cols = ["METER_LOCATION", "FLIGHT_NUMBER", "METER_TYPE"]
        for col in expected_cols:
            if col not in df.columns:
                return JSONResponse(status_code=400, content={"error": f"Missing expected column: {col}"})
                
        df = df[expected_cols].dropna()
        df["METER_LOCATION"] = df["METER_LOCATION"].astype(str).str.strip()
        df["FLIGHT_NUMBER"] = df["FLIGHT_NUMBER"].astype(str).str.strip()
        df["METER_TYPE"] = df["METER_TYPE"].astype(str).str.strip()
        
        engine = get_engine()
        if mode == "replace":
            df.to_sql("flight_meter_usage", engine, if_exists="replace", index=False)
        else:
            df.to_sql("flight_meter_usage", engine, if_exists="append", index=False)
        
        return {"message": f"Successfully loaded file with {len(df)} records in '{mode}' mode."}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/clear")
def clear_db():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES LIKE 'flight_meter_usage'")
        table_exists = cursor.fetchone()
        
        if table_exists:
            cursor.execute("TRUNCATE TABLE flight_meter_usage")
            conn.commit()
        conn.close()
        return {"message": "Database cleared successfully."}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

frontend_dir = Path("Front_end")
if not frontend_dir.exists():
    frontend_dir.mkdir(parents=True)
    
app.mount("/", StaticFiles(directory="Front_end", html=True), name="frontend")

import os
import pandas as pd
import random
import pymysql
from sqlalchemy import create_engine
from dotenv import load_dotenv
from pathlib import Path
import urllib.parse

load_dotenv()

DATA_DIR = Path("data")
EXCEL_PATH = DATA_DIR / "data.xlsx"
CSV_PATH = Path("Back_end") / "BMS.csv"

DB_HOST = os.getenv("db_host", "localhost")
DB_USER = os.getenv("db_user", "root")
DB_PASSWORD = os.getenv("db_password", "")
DB_NAME = os.getenv("db_name", "airport_db")

def generate_mock_data():
    print("Generating mock data...")
    gates = [f"Gate {str(i).zfill(2)}" for i in range(1, 21)]
    meter_types = ["FGP", "PCA", "PBB"]
    
    data = []
    for _ in range(2000): # 2000 flight instances
        flight_id = f"AI{random.randint(100, 999)}"
        gate = random.choice(gates)
        
        fgp_chance = 0.6 if gate == "Gate 05" else 0.95
        pca_chance = 0.5 if gate == "Gate 08" else 0.90
        pbb_chance = 0.4 if gate == "Gate 12" else 0.85

        if random.random() < fgp_chance:
            data.append({"METER_LOCATION": gate, "FLIGHT_NUMBER": flight_id, "METER_TYPE": "FGP"})
        if random.random() < pca_chance:
            data.append({"METER_LOCATION": gate, "FLIGHT_NUMBER": flight_id, "METER_TYPE": "PCA"})
        if random.random() < pbb_chance:
            data.append({"METER_LOCATION": gate, "FLIGHT_NUMBER": flight_id, "METER_TYPE": "PBB"})
                
    df = pd.DataFrame(data)
    df.to_excel(EXCEL_PATH, index=False)
    print("Mock data generated at", EXCEL_PATH)

def init_db():
    if not DATA_DIR.exists():
        DATA_DIR.mkdir(parents=True)
        
    if CSV_PATH.exists():
        print(f"Reading data from uploaded CSV: {CSV_PATH}...")
        df = pd.read_csv(CSV_PATH)
    elif EXCEL_PATH.exists():
        print(f"Reading data from {EXCEL_PATH}...")
        df = pd.read_excel(EXCEL_PATH)
    else:
        generate_mock_data()
        print(f"Reading data from {EXCEL_PATH}...")
        df = pd.read_excel(EXCEL_PATH)
    
    expected_cols = ["METER_LOCATION", "FLIGHT_NUMBER", "METER_TYPE"]
    for col in expected_cols:
        if col not in df.columns:
            raise ValueError(f"Missing expected column: {col}")
            
    df = df[expected_cols].dropna()
    df["METER_LOCATION"] = df["METER_LOCATION"].astype(str).str.strip()
    df["FLIGHT_NUMBER"] = df["FLIGHT_NUMBER"].astype(str).str.strip()
    df["METER_TYPE"] = df["METER_TYPE"].astype(str).str.strip()
    
    print("Connecting to MySQL server to ensure database exists...")
    try:
        # Connect without DB name to create it if necessary
        conn = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD
        )
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        conn.close()
        print(f"Database '{DB_NAME}' is ready.")
        
        print(f"Writing to MySQL database '{DB_NAME}'...")
        encoded_password = urllib.parse.quote_plus(DB_PASSWORD)
        engine = create_engine(f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}/{DB_NAME}")
        df.to_sql("flight_meter_usage", engine, if_exists="replace", index=False)
        print("Database initialization complete.")
    except Exception as e:
        print(f"Failed to initialize MySQL database: {e}")

if __name__ == "__main__":
    init_db()

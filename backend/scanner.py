# scanner.py
import cv2
import numpy as np
import faiss
from insightface.app import FaceAnalysis
import os

# --- NEW IMPORTS ---
from appwrite_storage_config import download_faiss_file # For Appwrite Storage
from firebase_config import get_student_info_by_faiss_key # For Firestore DB
# --- END NEW IMPORTS ---

# --- Configuration ---
SIMILARITY_THRESHOLD = 0.50
MODEL_NAME = 'antelopev2' 
# --- End Configuration ---

# Global variables for model and index
model = None
index = None
names = None

# --- Appwrite File IDs (Must match the file names in your Appwrite Bucket) ---
GCS_INDEX_PATH = "face_index.faiss" 
GCS_NAMES_PATH = "face_names.npy" 
# --- End Appwrite File IDs ---


def load_recognition_assets():
    """Loads the InsightFace model, FAISS index, and names once, downloading from Appwrite if necessary."""
    global model, index, names
    if model and index is not None:
        return 

    # 1. Initialize Model 
    try:
        model = FaceAnalysis(name=MODEL_NAME)
        model.prepare(ctx_id=-1)
        print(f"InsightFace model '{MODEL_NAME}' loaded.")
    except Exception as e:
        print(f"CRITICAL ERROR loading model: {e}")
        model = index = names = None
        raise

    # 2. Check Local Files and Download from Appwrite if Missing
    index_path = "embeddings/face_index.faiss"
    names_path = "embeddings/face_names.npy"
    
    if not os.path.exists(index_path) or not os.path.exists(names_path):
        print("🟡 Embeddings missing locally. Attempting download from Appwrite Storage...")
        
        os.makedirs("embeddings", exist_ok=True)
        
        try:
            # Call Appwrite Download Function
            download_faiss_file(GCS_INDEX_PATH, index_path)
            download_faiss_file(GCS_NAMES_PATH, names_path)
            
            print("✅ Embeddings downloaded successfully from Appwrite Storage.")
            
        except Exception as e:
            raise FileNotFoundError(f"Failed to download required FAISS files from Appwrite. Error: {e}") 
            
    # 3. Load FAISS index + names
    try:
        index = faiss.read_index(index_path)
        names = np.load(names_path)
        print("FAISS index and names loaded.")
        
    except Exception as e:
        print(f"CRITICAL ERROR loading FAISS data: {e}")
        model = index = names = None
        raise


# Load assets immediately when the module is imported
try:
    load_recognition_assets()
except:
    pass

# --- REMOVED: DUMMY STUDENT_DATA DICTIONARY ---


def recognize_face(frame):
    if model is None or index is None:
        raise RuntimeError("Recognition assets (model/index) failed to load.")

    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    faces = model.get(frame_rgb)
    
    largest_face = None
    max_area = 0

    if not faces:
        return {"recognized": []}

    for face in faces:
        x1, y1, x2, y2 = face.bbox.astype(int)
        area = (x2 - x1) * (y2 - y1)
        
        if area > max_area:
            max_area = area
            largest_face = face
    
    results = []
    if largest_face:
        x1, y1, x2, y2 = largest_face.bbox.astype(int)
        bbox = [int(x1), int(y1), int(x2), int(y2)] 

        emb = largest_face.embedding.astype("float32").reshape(1, -1)
        faiss.normalize_L2(emb)
        
        D, I = index.search(emb, k=1)
        similarity = 1 - D[0][0] / 2

        if similarity >= SIMILARITY_THRESHOLD:
            # This is the FAISS key (e.g., 'harvey')
            faiss_key = names[I[0][0]] 
            
            # --- NEW: Firestore Database Lookup ---
            student_doc = get_student_info_by_faiss_key(faiss_key)
            
            if student_doc:
                # Map Firestore document to frontend 'info' structure
                info = {
                    "id_number": student_doc.get('studentID', 'N/A'),
                    "college": student_doc.get('college', 'N/A'),
                    "year_level": student_doc.get('yearLevel', 'N/A'),
                }
                # Use the full name from the DB for a proper display name
                display_name = student_doc.get('studentName', faiss_key) 
            else:
                # Student found in FAISS but not in Firestore (Stale Index/Error)
                display_name = "Stale Record"
                info = {"id_number": "N/A", "college": "Error", "year_level": "Error"}
            # --- End NEW ---

            results.append({
                "name": str(display_name), 
                "similarity": float(round(similarity, 2)), 
                "bbox": bbox,
                "info": info 
            })
        else:
            # UNKNOWN face (below similarity threshold)
            display_name = "Unknown"
            info = {"id_number": "N/A", "college": "N/A", "year_level": "N/A"}
            results.append({
                "name": display_name, 
                "similarity": float(round(similarity, 2)), 
                "bbox": bbox,
                "info": info 
            })
    
    return {"recognized": results}
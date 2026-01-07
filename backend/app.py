from flask import Flask, request, jsonify, abort
from flask_cors import CORS
from functools import wraps
import cv2
import numpy as np
import os
import time

from firebase_config import verify_token
from scanner import recognize_face

app = Flask(__name__)
CORS(app) 

COOLDOWN_SECONDS = 5 * 60 # 5 minutes
last_log_time = {} # { student_name: timestamp }

# --- NEW: List of labels that should NEVER trigger a cooldown ---
EXCLUDED_FROM_COOLDOWN = ["Unknown", "Stale Record"]

# --- Login Required Decorator (Unchanged) ---
def firebase_login_required(allowed_roles):
    """Decorator to enforce authentication and check user roles via Firebase ID Token."""
    def wrapper(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({"error": "Authorization token is missing or invalid"}), 401
            
            id_token = auth_header.split(' ')[1]
            decoded_token = verify_token(id_token)
            
            if not decoded_token:
                return jsonify({"error": "Invalid or expired token"}), 401
            
            user_role = decoded_token.get('role')
            if user_role not in allowed_roles:
                return jsonify({"error": "Permission denied."}), 403

            request.user_token = decoded_token 
            return f(*args, **kwargs)
        return decorated
    return wrapper

@app.route("/")
def index():
    return jsonify({"message": "Face Recognition API is running."})

@app.route("/scan", methods=["POST"])
@firebase_login_required(allowed_roles=['GATE']) 
def scan():
    user_data = request.user_token 
    gate_number = user_data.get('gate_number', 'N/A')

    if "frame" not in request.files:
        abort(400, description="No frame file provided.")

    file = request.files["frame"]
    
    try:
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        if img is None:
            abort(400, description="Could not decode image.")
    except Exception as e:
        print(f"Error processing frame: {e}")
        abort(500)

    try:
        result = recognize_face(img)
        
        # Check if we have detected faces
        if result.get('recognized') and len(result['recognized']) > 0:
            face_data = result['recognized'][0]
            student_name = face_data['name']
            
            # --- UPDATED Cooldown Logic ---
            # We ONLY check cooldown if the name is NOT "Unknown" and NOT "Stale Record"
            if student_name not in EXCLUDED_FROM_COOLDOWN:
                now = time.time()
                last_time = last_log_time.get(student_name)
                
                if last_time and (now - last_time < COOLDOWN_SECONDS):
                    # Only valid students scan once every 5 mins
                    face_data['similarity'] = "COOLDOWN" 
                    print(f"Gate {gate_number} scanned: {student_name} (COOLDOWN ACTIVE - Next log: {COOLDOWN_SECONDS - int(now - last_time)}s)")
                else:
                    # Log the student and set the new timestamp
                    last_log_time[student_name] = now
                    # TODO: Add Appwrite Log code here
                    print(f"Gate {gate_number} scanned: {student_name} (LOGGED)")
            else:
                # This branch runs for "Unknown" or "Stale Record"
                # They never get added to last_log_time, so they never trigger cooldown
                print(f"Gate {gate_number} scanned: {student_name} (BYPASS COOLDOWN)")
            # --- End Cooldown Logic ---
            
        return jsonify(result)
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        abort(500)

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
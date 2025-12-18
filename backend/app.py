# app.py
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

COOLDOWN_SECONDS = 5 * 60 # 5 minutes * 60 seconds
last_log_time = {} # { student_name: timestamp (seconds), ... }


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
                return jsonify({"error": "Permission denied. Required role: " + ", ".join(allowed_roles)}), 403

            request.user_token = decoded_token 
            return f(*args, **kwargs)
        return decorated
    return wrapper
# --- End Decorator ---


@app.route("/")
def index():
    return jsonify({"message": "Face Recognition API is running."})

@app.route("/scan", methods=["POST"])
@firebase_login_required(allowed_roles=['GATE']) 
def scan():
    user_data = request.user_token 
    gate_number = user_data.get('gate_number', 'N/A')

    # 1. Input Validation and Decoding
    if "frame" not in request.files:
        abort(400, description="No frame file provided in request.")

    file = request.files["frame"]
    
    try:
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        
        if img is None:
            abort(400, description="Could not decode image frame.")
            
    except Exception as e:
        print(f"Error processing frame: {e}")
        abort(500, description="Internal server error during frame processing.")


    # 3. Call Recognition Logic
    try:
        result = recognize_face(img)
        
        if result.get('recognized') and result['recognized'][0]['name'] != "Unknown":
            student_name = result['recognized'][0]['name']
            
            # --- Cooldown Logic ---
            now = time.time()
            
            last_time = last_log_time.get(student_name)
            
            if last_time and (now - last_time < COOLDOWN_SECONDS):
                result['recognized'][0]['similarity'] = "COOLDOWN" 
                print(f"Gate {gate_number} scanned: {student_name} (COOLDOWN ACTIVE - Next log: {COOLDOWN_SECONDS - int(now - last_time)}s)")
            else:
                last_log_time[student_name] = now
                # NOTE: Implement Appwrite Log Submission here later
                print(f"Gate {gate_number} scanned: {student_name} (LOGGED)")
            # --- End Cooldown Logic ---
            
            
        return jsonify(result)
        
    except RuntimeError as e:
        print(f"Error during face recognition: {e}")
        abort(500, description="Recognition system failed to initialize. Check console for details.")
    except Exception as e:
        print(f"Unexpected error during face recognition: {e}")
        abort(500, description="Unexpected internal server error during face recognition.")

if __name__ == "__main__":
    print("Starting Flask server for Next.js communication.")
    app.run(host='0.0.0.0', port=5000)
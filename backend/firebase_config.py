# firebase_config.py
import firebase_admin
from firebase_admin import credentials, auth, firestore, storage 
from functools import wraps
import os

# --- Configuration ---
# !! IMPORTANT: RENAME THE JSON FILE BELOW TO MATCH THE FILE YOU DOWNLOADED !!
JSON_FILENAME = 'tup-id-verification-adminsdk.json' 
# You still need your bucket name if you use Firebase/GCS for anything, but it's optional here
# If you don't use it, you can remove 'storage' from imports and the 'storageBucket' line.
YOUR_BUCKET_NAME = 'tup-id-verification.appspot.com' 
# --- End Configuration ---

# Get the absolute path to your service account key
CRED_PATH = os.path.join(os.path.dirname(__file__), JSON_FILENAME)

# Global clients
db = None
f_auth = None
f_storage = None

# Initialize the app using a service account
try:
    cred = credentials.Certificate(CRED_PATH)
    firebase_admin.initialize_app(cred, {
        'storageBucket': YOUR_BUCKET_NAME
    })
    
    # Get references to the services
    db = firestore.client() 
    f_auth = auth 
    f_storage = storage 
    
    print("✅ Firebase Admin SDK Initialized.")
    
except Exception as e:
    print(f"❌ CRITICAL ERROR: Firebase initialization failed. Error: {e}")


def verify_token(id_token):
    """Verifies a Firebase ID Token and returns the decoded token data."""
    if not f_auth: return None
    try:
        decoded_token = f_auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        return None

# --- NEW: Firestore Student Lookup Function ---
def get_student_info_by_faiss_key(faiss_name: str):
    """Queries Firestore for student info based on the FAISS name key."""
    if not db: return None

    try:
        # Query the 'registered_students' collection where 'faiss_name_key' equals the recognized name
        # NOTE: 'faiss_name_key' must be a lowercase field in your Firestore document.
        docs = db.collection('registered_students').where('faiss_name_key', '==', faiss_name.lower()).limit(1).get()
        
        if len(docs) > 0:
            # Return the data dictionary of the first match
            return docs[0].to_dict()
        
        return None
    except Exception as e:
        print(f"Firestore query error: {e}")
        return None
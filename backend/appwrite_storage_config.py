# appwrite_storage_config.py (For FaceScanner/backend)
from appwrite.client import Client
from appwrite.services.storage import Storage
import os

# --- CRITICAL CONFIGURATION: REPLACE THESE PLACEHOLDERS ---
# 1. Appwrite Server Details
APPWRITE_ENDPOINT = "http://localhost/v1" 
APPWRITE_PROJECT_ID = "6935a013000245ee3c7c" 

APPWRITE_API_KEY = "a52d3e334310dca8be45a9b8414a28e8caf991e665d784483704a3785a0e0bb60ad1258a4c2b8c44dffb95cef212dbb2cb3dcea128979ef379996c7ba601ee8c0fa569e4052577864c018cdc4cc29419ea26318811fd32e546042f89b94f507a0c32ec8805d43bf2c4744178921180a9d14ac3d326a3a3a503f56dee31c6c0ce" 

FAISS_BUCKET_ID = "6935a3a50024ddc67678" 


# Initialize the Appwrite Client
try:
    client = Client()
    client.set_endpoint(APPWRITE_ENDPOINT)
    client.set_project(APPWRITE_PROJECT_ID)
    client.set_key(APPWRITE_API_KEY) 
    appwrite_storage = Storage(client)
    print("✅ Appwrite Storage Client Initialized.")
except Exception as e:
    print(f"❌ CRITICAL ERROR: Appwrite client initialization failed. Error: {e}")
    # Set to None on failure so scanner.py can detect it
    appwrite_storage = None 


def download_faiss_file(file_id: str, local_save_path: str) -> bool:
    """Downloads a file from Appwrite Storage for FAISS data."""
    if not appwrite_storage:
        print("Storage service not available for download.")
        return False
        
    try:
        file_content = appwrite_storage.get_file_download(
            bucket_id=FAISS_BUCKET_ID,
            file_id=file_id
        )
        
        # Write the content to the local file
        os.makedirs(os.path.dirname(local_save_path), exist_ok=True)
        with open(local_save_path, 'wb') as f:
            f.write(file_content)
            
        return True
    except Exception as e:
        # NOTE: This error is often a 404 (File Not Found) or 401/403 (Permission)
        print(f"❌ Appwrite Download Error for {file_id}: {e}")
        return False
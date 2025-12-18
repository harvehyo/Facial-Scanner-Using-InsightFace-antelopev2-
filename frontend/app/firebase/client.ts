// frontend/src/app/firebase/client.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// IMPORTANT: Replace with your actual Firebase config (get this from Firebase Project Settings -> General)
const firebaseConfig = {
  apiKey: "AIzaSyCkPbJFUUEOL3DRA8nMJrgJavmp-EVDbLM",
  authDomain: "tup-id-verification.firebaseapp.com",
  projectId: "tup-id-verification",
  storageBucket: "tup-id-verification.firebasestorage.app",
  messagingSenderId: "1042468746164",
  appId: "1:1042468746164:web:c46a1fad6750901d7eb8e1",
  measurementId: "G-NXC95E467D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
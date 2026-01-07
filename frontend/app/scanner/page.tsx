"use client";
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, AlertCircle, Play, StopCircle, Loader2, LogOut } from 'lucide-react';

const API_URL = "http://localhost:5000/scan";
const SCAN_INTERVAL = 500;

const COLORS = {
    CARDINAL_RED: '#C41E3A',
    MEDIUM_GRAY: '#7D7D7D',
    BLACK: '#000000',
    LIME: '#00FF00', 
    RED: '#FF0000',
    GREEN_SUCCESS: '#4CAF50' // Ensure this is defined
};

interface StudentInfo { id_number: string; college: string; year_level: string; }
interface RecognitionResult { name: string; similarity: number | string; bbox: number[]; timestamp: number; info: StudentInfo; }
interface PopupDisplayData extends StudentInfo { name: string; isLogged: boolean; }

export default function FaceScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter(); 

  // --- ALL STATE AND REF DEFINITIONS ---
  const [isRunning, setIsRunning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [output, setOutput] = useState("Scanner is idle.");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] = useState<RecognitionResult | null>(null);
  const [popupData, setPopupData] = useState<PopupDisplayData | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false); 
  const scanIntervalId = useRef<NodeJS.Timeout | null>(null);
  const popupTimerId = useRef<NodeJS.Timeout | null>(null);
  // --- END ALL STATE AND REF DEFINITIONS ---


  // ====================================================================
  // === CORE HELPER FUNCTIONS (DEFINED FIRST TO AVOID REFERENCE ERRORS) ==
  // ====================================================================

  // --- STOP SCANNER ---
  const stopScanner = () => {
    // 1. Clear recursive timeouts
    if (scanIntervalId.current) {
        clearTimeout(scanIntervalId.current);
        scanIntervalId.current = null;
    }
    if (popupTimerId.current) {
        clearTimeout(popupTimerId.current);
        popupTimerId.current = null;
    }

    // 2. Stop media stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
        if (overlayCanvasRef.current) {
            overlayCanvasRef.current.getContext('2d')?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
        }
    }
    
    // 3. Update state
    setIsRunning(false);
    setProcessing(false);
    setLastSuccessfulResult(null);
    setPopupData(null); 
    setOutput("🛑 Scanner stopped.");
  };

  // --- START SCANNER ---
  const startScanner = async () => {
    if (!authToken) {
      setError("Session token not found. Please log in.");
      router.replace('/login');
      return;
    }
    if (isRunning) return;

    setError(null);
    setOutput("🔗 Requesting camera access...");
    
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!videoRef.current || !canvasRef.current || !overlayCanvasRef.current) return;
      
      videoRef.current.srcObject = mediaStream;
      setStream(mediaStream);

      // Set canvas dimensions based on the stream
      const track = mediaStream.getVideoTracks()[0];
      const settings = track.getSettings();
      
      videoRef.current.width = settings.width || 640;
      videoRef.current.height = settings.height || 480;
      canvasRef.current.width = settings.width || 640;
      canvasRef.current.height = settings.height || 480;
      overlayCanvasRef.current.width = settings.width || 640;
      overlayCanvasRef.current.height = settings.height || 480;

      setIsRunning(true);
      setOutput("🟢 Scanner Ready. Scanning for faces...");

    } catch (e: any) {
      console.error("Camera access error:", e);
      setError("❌ Camera access denied or unavailable. Check permissions.");
      setIsRunning(false);
    }
  };


  // --- LOGOUT FUNCTION (Uses stopScanner, so must be defined after it) ---
  const handleLogout = useCallback(() => { 
    localStorage.removeItem('userToken');
    stopScanner(); 
    router.replace('/login');
  }, [router]);


  // --- DRAW BOUNDING BOX ---
  const drawBoundingBox = useCallback((bbox: number[], name: string, similarity: number | string) => {
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext('2d');
    if (!overlayCtx || !overlayCanvas) return;

    const [x, y, x2, y2] = bbox;
    const w = x2 - x;
    const h = y2 - y;
    
    const isCooldown = similarity === "COOLDOWN";
    
    const displayScore = isCooldown ? "COOLDOWN" : (similarity as number).toFixed(2);
    const displayName = (name === "Unknown" || isCooldown) 
        ? (isCooldown ? "COOLDOWN (5 MIN)" : "Unknown")
        : `${name} (${displayScore})`;

    const color = (name === "Unknown" || isCooldown) 
        ? (isCooldown ? 'yellow' : COLORS.RED) 
        : COLORS.LIME; 
    
    // 1. Draw the box
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeRect(x, y, w, h);

    // 2. Draw the text (un-flip fix)
    overlayCtx.fillStyle = color;
    overlayCtx.font = '24px sans-serif';
    
    overlayCtx.save();
    const canvasWidth = overlayCanvas.width;
    const textBaseX = canvasWidth - (x + w);
    const textBaseY = y - 10;
    
    overlayCtx.translate(textBaseX, textBaseY);
    overlayCtx.scale(-1, 1);
    
    overlayCtx.textAlign = 'left';
    overlayCtx.fillText(displayName, 0, 0); 
    
    overlayCtx.restore();
  }, []);


  // --- SCAN FRAME LOGIC ---
  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !overlayCanvasRef.current || !isRunning || !authToken) {
      if (!authToken && isRunning) handleLogout();
      return;
    }
    
    if (processing) {
      if (isRunning) {
         scanIntervalId.current = setTimeout(scanFrame, SCAN_INTERVAL);
      }
      return;
    }

    setProcessing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!; 
    
    try {
      // 1. Image Capture and Fetch Logic
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error("Could not create image blob.");
      
      const formData = new FormData();
      formData.append('frame', blob);

      // 2. Send to API
      const res = await fetch(API_URL, { 
        method: 'POST', 
        body: formData,
        headers: {
          'Authorization': `Bearer ${authToken}` 
        }
      });
      
      // Check for 401 Unauthorized Response
      if (res.status === 401 || res.status === 403) throw new Error("Session expired or unauthorized.");
      if (!res.ok) throw new Error(`Server returned status: ${res.status}`);

      const result = await res.json();
      
      // 3. Process Result and Update State
      if (result.recognized.length > 0) {
        const recognizedFace = result.recognized[0];
        const isCooldown = recognizedFace.similarity === "COOLDOWN";
        
        // Output text logic
        const statusText = isCooldown ? "5-Min Cooldown" : `Similarity: ${(recognizedFace.similarity as number).toFixed(2)}`;
        setOutput(`<p style="color: ${isCooldown ? COLORS.CARDINAL_RED : COLORS.BLACK};"><strong>${recognizedFace.name}</strong> (${statusText})</p>`);
        
        // Update persistent state
        setLastSuccessfulResult({
            name: recognizedFace.name,
            similarity: recognizedFace.similarity,
            bbox: recognizedFace.bbox,
            timestamp: Date.now(),
            info: recognizedFace.info,
        });
        
        // --- Pop-up Timer Management Logic (Self-Clearing) ---
        if (recognizedFace.name !== "Unknown") {
            if (popupTimerId.current) {
                clearTimeout(popupTimerId.current);
            }

            setPopupData({
                name: recognizedFace.name,
                isLogged: !isCooldown,
                id_number: recognizedFace.info.id_number,
                college: recognizedFace.info.college,
                year_level: recognizedFace.info.year_level,
            });

            popupTimerId.current = setTimeout(() => {
                setPopupData(null);
                popupTimerId.current = null;
            }, 2000); 
        }
      } else {
        setPopupData(null);
        setOutput("❌ No face recognized.");
    }
    } catch (err: any) {
      console.error(err);
      if (String(err).includes("Session expired")) {
        handleLogout();
      }
      setError(`Scanning Error: ${String(err).includes("Session expired") ? "Session Expired" : String(err).substring(0, 50)}...`);
    } finally {
      setProcessing(false);
      if (isRunning) {
        scanIntervalId.current = setTimeout(scanFrame, SCAN_INTERVAL);
      } else {
        scanIntervalId.current = null;
      }
    }
  }, [isRunning, processing, drawBoundingBox, authToken, handleLogout]);


  // --- EFFECT: Triggers Scanning and Cleans Up on Exit ---
  useEffect(() => {
    // If running, start the frame scan
    if (isInitialized && authToken && isRunning) {
      scanFrame();
    }
    
    // Cleanup function:
    return () => {
        if (scanIntervalId.current) {
            clearTimeout(scanIntervalId.current);
            scanIntervalId.current = null;
        }
    };
}, [isRunning, scanFrame, isInitialized, authToken]);


  // --- EFFECT: Controls the persistent drawing logic (Runs at browser FPS) ---
  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas?.getContext('2d');
    if (!overlayCtx || !overlayCanvas) return;

    let animationFrameId: number;
    const DRAW_TIMEOUT = SCAN_INTERVAL * 2.5;

    const renderLoop = () => {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (lastSuccessfulResult) {
        if (Date.now() - lastSuccessfulResult.timestamp < DRAW_TIMEOUT) {
          drawBoundingBox(
              lastSuccessfulResult.bbox, 
              lastSuccessfulResult.name, 
              lastSuccessfulResult.similarity
          );
        } else {
          setLastSuccessfulResult(null);
        }
      }
      
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    if (isRunning) {
      renderLoop();
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isRunning, lastSuccessfulResult, drawBoundingBox]);


  // --- Final Authentication Check (Display Loading Screen or Redirect) ---
  useEffect(() => { // Replaced with useEffect
    const token = localStorage.getItem('userToken');
    if (token) {
      setAuthToken(token);
    } else {
      router.replace('/login'); 
      return;
    }
    setIsInitialized(true); 
  }, [router]);


  // --- Final Authentication Render Check ---
  if (!isInitialized) {
      return (
          <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
              <Loader2 className="h-8 w-8 animate-spin" style={{color: COLORS.CARDINAL_RED}} /> 
              <h1 className="text-xl text-gray-700">Checking Session...</h1>
          </div>
      );
  }
  
  if (!authToken) {
      // Should not hit this if the logic above is correct, but for safety:
      router.replace('/login');
      return null; 
  }

// --- Render ---
return (
  <div className="flex flex-col items-center justify-start min-h-screen bg-gray-50 p-4 relative">
    <Button 
      onClick={handleLogout} 
      variant="ghost" 
      className="absolute top-4 right-4 text-red-500 hover:text-red-700"
    >
      <LogOut className="mr-2 h-4 w-4" /> Logout
    </Button>
    
    <Card className="w-full max-w-full md:max-w-xl shadow-2xl">
      <CardHeader className="text-center">
        {/* Main Title Color Change */}
        <CardTitle 
          className="text-3xl flex items-center justify-center gap-2" 
          style={{color: COLORS.CARDINAL_RED}}
        >
          <Camera className="h-6 w-6" /> Live Face Scanner (Gate Access)
        </CardTitle>
        <CardDescription style={{color: COLORS.MEDIUM_GRAY}}>
          High-accuracy, real-time face recognition.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col items-center">
        
        {/* Video and Overlay Container */}
        <div className="relative w-full sm:max-w-md md:max-w-lg rounded-xl overflow-hidden shadow-lg border-2 border-gray-300 mb-4">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`w-full h-auto object-cover scale-x-[-1] bg-black ${isRunning ? '' : 'hidden'}`}
            style={{ width: 640, height: 480 }} 
          />
          <canvas 
            ref={overlayCanvasRef} 
            className={`absolute top-0 left-0 w-full h-full scale-x-[-1] ${isRunning ? '' : 'hidden'}`} 
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {!isRunning && (
            <div 
              className="w-full h-full flex items-center justify-center bg-gray-800 text-white p-2" 
              style={{ width: 640, height: 480 }}
            >
              <AlertCircle className="h-8 w-8 mr-2" /> Scanner is Idle
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-4 mb-4 mt-3">
          <Button 
            onClick={startScanner} 
            disabled={isRunning || processing}
            style={{backgroundColor: COLORS.GREEN_SUCCESS}} 
            className="text-white transition-all duration-200 ease-in-out hover:opacity-90 cursor-pointer"
          >
            {processing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Start Scanner
          </Button>

          <Button 
            onClick={stopScanner} 
            disabled={!isRunning}
            variant="destructive"
          >
            <StopCircle className="mr-2 h-4 w-4" /> Stop Scanner
          </Button>
        </div>
        
        {error && (
          <Alert variant="destructive" className="w-full max-w-lg mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Output Display */}
        <div className="w-full text-center min-h-[30px] p-2 bg-gray-100 rounded-md">
          <div dangerouslySetInnerHTML={{ __html: output }} />
        </div>
      </CardContent>
    </Card>
        {/* --- Permanent Recognition Box (with Status label & aligned info) --- */}
        {popupData && (
          <div className="w-full sm:max-w-md md:max-w-lg p-4 rounded-xl shadow-lg bg-white mt-4">
            {/* Status line */}
            <p className="font-bold text-base text-red-600 mb-3">
              Status: {popupData.isLogged ? "Access Granted" : "Cooldown Active"}
            </p>

          <div className="flex flex-wrap justify-between items-center mb-3">
            <p className="text-xl font-semibold text-black">{popupData.name}</p>
            <p className="text-base text-gray-700 font-semibold">{popupData.college}</p>
          </div>

          <div className="flex flex-wrap justify-between items-center">
            <p className="text-base text-gray-700 font-semibold">ID: {popupData.id_number}</p>
            <p className="text-base text-gray-700 font-semibold">Year: {popupData.year_level}</p>
          </div>

          </div>
        )}
  </div>
);
}
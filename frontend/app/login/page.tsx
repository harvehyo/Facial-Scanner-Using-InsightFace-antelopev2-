"use client";
import React, { useState, ChangeEvent, FormEvent } from 'react'; // Added ChangeEvent and FormEvent
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/client';
import { Camera, LogIn, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: FormEvent) => { // Using FormEvent type
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const idToken = await user.getIdToken(true);
      const tokenResult = await user.getIdTokenResult(true);
      const userRole = tokenResult.claims.role;
      
      if (!userRole) {
        throw new Error("User role not set. Please contact the administrator.");
      }

      // 4. Store the Token (in localStorage) and Redirect
      localStorage.setItem('userToken', idToken); 
      
      // --- CRITICAL CHANGE: Redirect ALL successful users to /scanner ---
      if (userRole === 'GATE' || userRole === 'ADMIN') {
        router.push('/scanner'); 
      } else {
        throw new Error("Invalid user role detected.");
      }

    } catch (err: any) {
      console.error("Login failed:", err);
      // Clean up the error message from Firebase for better UX
      const firebaseError = err.message.includes('auth/') 
        ? err.code.replace('auth/', '').replace(/-/g, ' ') 
        : 'An unknown error occurred.';
        
      setError(`Login Failed: ${firebaseError}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl flex items-center justify-center gap-2 text-blue-700">
            <Camera className="h-6 w-6" /> TUP Verification Login
          </CardTitle>
          <CardDescription>
            Enter your credentials to access the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Input */}
            <div className="space-y-2">
              <label htmlFor="email">Email</label>
              <Input 
                id="email" 
                type="email" 
                placeholder="gate1@tup.edu.ph" 
                required 
                value={email} 
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              />
            </div>
            {/* Password Input */}
            <div className="space-y-2">
              <label htmlFor="password">Password</label>
              <Input 
                id="password" 
                type="password" 
                placeholder="******" 
                required 
                value={password} 
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              />
            </div>
            
            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              {loading ? 'Logging In...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { auth, googleProvider, enableOfflinePersistence } from "@/lib/firebase"
import { startRealtimeSync, stopRealtimeSync } from "@/lib/firebase-sync-engine"
import {
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
    User as FirebaseUser,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInAnonymously
} from "firebase/auth"

// Extend Firebase User or create a Union type to support local users
export type User = FirebaseUser | {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    role?: string;
    branchId?: string;
}

interface AuthContextType {
    user: User | null
    loading: boolean
    signInWithGoogle: () => Promise<void>
    loginLocal: (user: User) => void
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        enableOfflinePersistence().catch(() => { })
        // 1. Check Local Storage first (for Mobile/Offline/Branch login)
        const localUser = localStorage.getItem('sahat_user')
        if (localUser) {
            try {
                setUser(JSON.parse(localUser))
                // Start realtime sync even for local users to ensure cloud->local updates
                startRealtimeSync()
            } catch (e) {
                console.error("Failed to parse local user", e)
                localStorage.removeItem('sahat_user')
            } finally {
                setLoading(false)
            }
        }

        // 2. Check Firebase
        if (!auth) {
            setLoading(false)
            return
        }
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                // If we also have a local user, we might want to keep the local user details 
                // but use the firebase connection.
                // For now, if firebaseUser exists, just ensure we sync.
                if (!localUser) {
                    // Only treat as "Logged In" if NOT anonymous (e.g. Google Auth)
                    // Anonymous users are for Sync only.
                    if (!firebaseUser.isAnonymous) {
                        setUser(firebaseUser)
                    } else {
                        // Ensure UI knows we are NOT logged in
                        setUser(null)
                    }
                }
                startRealtimeSync()
            } else {
                // No firebase user.
                // If we have a local user, we STILL need a firebase connection for sync to work 
                // (assuming rules allow anonymous or public access, but usually auth!=null is required).
                // So execute anonymous login.
                console.log("No Firebase user, signing in anonymously for sync...")
                signInAnonymously(auth).catch((e) => console.error("Anonymous login failed", e))

                if (!localUser) {
                    setUser(null)
                }
            }
            setLoading(false)
        })
        return () => {
            unsubscribe()
            stopRealtimeSync()
        }
    }, [])

    const signInWithGoogle = async () => {
        if (!auth || !googleProvider) {
            console.warn("Firebase Auth not initialized")
            return
        }
        try {
            const result = await signInWithPopup(auth, googleProvider)
            // Optional: Save to local storage if we want persistence across strict restarts?
            // Firebase handles its own persistence usually.
        } catch (error) {
            console.error("Error signing in with Google", error)
            throw error
        }
    }

    const loginLocal = (userData: User) => {
        setUser(userData)
        localStorage.setItem('sahat_user', JSON.stringify(userData))
    }

    const logout = async () => {
        try {
            // Clear Local
            localStorage.removeItem('sahat_user')
            setUser(null)

            // Clear Firebase
            if (auth) {
                await firebaseSignOut(auth)
            }
            stopRealtimeSync()
        } catch (error) {
            console.error("Error signing out", error)
        } finally {
            // Force hard redirect to login to ensure clean state
            window.location.href = "/login"
        }
    }

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, loginLocal, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)

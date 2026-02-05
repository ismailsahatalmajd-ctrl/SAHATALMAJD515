"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { auth, googleProvider, enableOfflinePersistence, db } from "@/lib/firebase"
import { startRealtimeSync, stopRealtimeSync } from "@/lib/firebase-sync-engine"
import {
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
    signInAnonymously
} from "firebase/auth"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { User, UserProfile } from "@/lib/types"

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
        const localUserStr = localStorage.getItem('sahat_user')
        if (localUserStr) {
            try {
                const localUser = JSON.parse(localUserStr) as User
                setUser(localUser)
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
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                if (!firebaseUser.isAnonymous) {
                    // Fetch comprehensive profile from Firestore
                    try {
                        const userDocRef = doc(db, "users", firebaseUser.uid)
                        const userDoc = await getDoc(userDocRef)

                        if (userDoc.exists()) {
                            // Merge Firestore data with Auth data
                            const firestoreData = userDoc.data() as Partial<UserProfile>
                            const fullProfile: UserProfile = {
                                uid: firebaseUser.uid,
                                email: firebaseUser.email || "",
                                displayName: firestoreData.displayName || firebaseUser.displayName || "User",
                                photoURL: firebaseUser.photoURL || undefined,
                                role: firestoreData.role || 'staff',
                                permissions: firestoreData.permissions || {} as any, // Will be handled by hasPermission fallback
                                branchId: firestoreData.branchId,
                                isActive: firestoreData.isActive ?? true,
                                createdAt: firestoreData.createdAt || new Date().toISOString(),
                                lastLogin: new Date().toISOString()
                            }
                            setUser(fullProfile)
                        } else {
                            // First time login or no profile?
                            // Create a basic profile or just handle as transient
                            // For improved UX, we might want to auto-create a 'pending' profile here
                            const newProfile: UserProfile = {
                                uid: firebaseUser.uid,
                                email: firebaseUser.email || "",
                                displayName: firebaseUser.displayName || "New User",
                                photoURL: firebaseUser.photoURL || undefined,
                                role: 'staff', // Default role
                                permissions: {} as any,
                                isActive: true,
                                createdAt: new Date().toISOString(),
                                lastLogin: new Date().toISOString()
                            }
                            // Optionally save to DB? Let's just use it in state for now
                            setUser(newProfile)
                        }
                    } catch (e) {
                        console.error("Error fetching user profile", e)
                    }
                } else {
                    // Anonymous
                    if (!localUserStr) {
                        setUser(null)
                    }
                }
                startRealtimeSync()
            } else {
                // No firebase user.
                console.log("No Firebase user, signing in anonymously for sync...")
                signInAnonymously(auth).catch((e) => console.error("Anonymous login failed", e))

                if (!localUserStr) {
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
            await signInWithPopup(auth, googleProvider)
            // onAuthStateChanged will handle the rest
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
        }
    }

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, loginLocal, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)

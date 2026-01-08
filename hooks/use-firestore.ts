"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { collection, onSnapshot, query, where, orderBy, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore"
import { useAuth } from "@/components/auth-provider"
import type { Issue, Product, Return, Transaction, Branch, Category, Unit, InventoryAdjustment } from "@/lib/types"
import type { BranchRequest } from "@/lib/branch-request-types"

// Generic hook helper
function useCollection<T>(collectionName: string) {
    const { user } = useAuth()
    const [data, setData] = useState<T[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user || !db) {
            setLoading(false)
            return
        }

        const q = query(collection(db, collectionName))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items: T[] = []
            snapshot.forEach((doc) => {
                items.push(doc.data() as T)
            })
            setData(items)
            setLoading(false)
        }, (error) => {
            console.error(`Error syncing ${collectionName}:`, error)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [user, collectionName])

    return { data, loading }
}

export function useProducts() {
    return useCollection<Product>("products")
}

export function useIssues() {
    return useCollection<Issue>("issues")
}

export function useReturns() {
    return useCollection<Return>("returns")
}

export function useTransactions() {
    return useCollection<Transaction>("transactions")
}

export function useBranches() {
    return useCollection<Branch>("branches")
}

export function useCategories() {
    return useCollection<Category>("categories")
}

export function useUnits() {
    return useCollection<Unit>("units")
}

export function useBranchRequests() {
    return useCollection<BranchRequest>("branchRequests")
}

export function useAdjustments() {
    return useCollection<InventoryAdjustment>("inventoryAdjustments")
}

// Action helpers
export async function saveDocument(collectionName: string, data: any) {
    if (!db) throw new Error("Firebase DB not initialized")
    if (!data.id) throw new Error("Document must have an ID")
    await setDoc(doc(db, collectionName, data.id), data)
}

export async function deleteDocument(collectionName: string, id: string) {
    if (!db) throw new Error("Firebase DB not initialized")
    await deleteDoc(doc(db, collectionName, id))
}

export async function batchSave(operations: { collection: string, data: any, type: 'set' | 'update' | 'delete' }[]) {
    if (!db) throw new Error("Firebase DB not initialized")
    const batch = writeBatch(db)
    
    operations.forEach(op => {
        if (!db) return
        const ref = doc(db, op.collection, op.data.id)
        if (op.type === 'delete') {
            batch.delete(ref)
        } else {
            batch.set(ref, op.data, { merge: true })
        }
    })
    
    await batch.commit()
}

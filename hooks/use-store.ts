import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { useState, useEffect, useMemo } from 'react'
import type { Branch, Location, Product, Transaction, Category, Unit, Issue, InventoryAdjustment, Return } from "@/lib/types"
import type { PurchaseRequest } from "@/lib/purchase-request-types"
import type { BranchRequest } from "@/lib/branch-request-types"
import type { BranchInvoice } from "@/lib/branch-invoice-types"

// Helper for Dexie hooks
function useDexieTable<T>(table: any) {
    const data = useLiveQuery(() => table.toArray() as Promise<T[]>, [table])
    return { data: data || [], loading: data === undefined }
}

function useDexieTableProgressive<T>(table: any, chunkSize = 50) {
    const [limit, setLimit] = useState(chunkSize)
    const data = useLiveQuery(() => table.limit(limit).toArray() as Promise<T[]>, [table, limit])

    useEffect(() => {
        if (data && data.length >= limit) {
            const timer = setTimeout(() => {
                setLimit(prev => prev + chunkSize)
            }, 200)
            return () => clearTimeout(timer)
        }
    }, [data, limit, chunkSize])

    return useMemo(() => ({ data: data || [], loading: data === undefined }), [data])
}

export function useStoreData<T>(getData: () => T, event: string) {
    // Legacy support for non-migrated hooks
    const [data, setData] = useState<T>(() => getData())

    useEffect(() => {
        setData(getData())
    }, [])

    return data
}

export function useProductsRealtime() {
    // Show newest products first
    const table = useMemo(() => db.products.toCollection().reverse(), [])
    return useDexieTableProgressive<Product>(table, 5000)
}

export function useCategoriesRealtime() {
    return useDexieTable(db.categories)
}

export function useTransactionsRealtime() {
    // Show newest transactions first
    const table = useMemo(() => db.transactions.toCollection().reverse(), [])
    return useDexieTableProgressive(table, 50)
}

export function usePurchasesRealtime() {
    // transactions where type is 'purchase', reversed to show newest first (assuming id is time-based)
    const table = useMemo(() => db.transactions.where('type').equals('purchase').reverse(), [])
    return useDexieTableProgressive(table, 50)
}

export function usePurchaseRequestsRealtime() {
    const table = useMemo(() => db.purchaseRequests.toCollection().reverse(), [])
    return useDexieTableProgressive(table, 20)
}

export function useBranchesRealtime() {
    return useDexieTable<Branch>(db.branches)
}

export function useIssuesRealtime() {
    // Show newest issues first
    const table = useMemo(() => db.issues.toCollection().reverse(), [])
    return useDexieTableProgressive(table, 20)
}

export function useReturnsRealtime() {
    return useDexieTableProgressive(db.returns, 20)
}

export function useBranchRequestsRealtime() {
    return useDexieTableProgressive(db.branchRequests, 20)
}

export function useBranchInvoicesRealtime() {
    return useDexieTableProgressive(db.branchInvoices, 20)
}

export function useAdjustmentsRealtime() {
    return useDexieTable(db.inventoryAdjustments)
}

export function useLocationsRealtime() {
    return useDexieTable<Location>(db.locations)
}

export function useFinancialSummaryRealtime() {
    const { data: products } = useProductsRealtime()
    const { data: transactions } = useTransactionsRealtime()

    const summary = useMemo(() => {
        if (!products || !transactions) {
            return {
                totalPurchases: 0,
                totalSales: 0,
                totalInventoryValue: 0,
                profit: 0,
                period: 'all'
            }
        }

        let totalPurchases = 0
        let totalSales = 0
        let totalInventoryValue = 0

        transactions.forEach((t: any) => {
            if (t.type === 'purchase') totalPurchases += t.totalAmount || 0
            if (t.type === 'sale') totalSales += t.totalAmount || 0
        })

        products.forEach((p: any) => {
            totalInventoryValue += ((p.currentStock || 0) * (p.averagePrice || 0))
        })

        return {
            totalPurchases,
            totalSales,
            totalInventoryValue,
            profit: totalSales - totalPurchases,
            period: 'all'
        }
    }, [products, transactions])

    return summary
}

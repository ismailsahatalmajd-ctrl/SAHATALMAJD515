import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface HistoryItem {
    id: string
    internalCode: string
    barcode: string
    productNameArabic: string
    productNameEnglish: string
    timestamp: number
    details?: {
        category: string
        brand: string
        color: string
        collection?: string
    }
}

interface HistoryStore {
    items: HistoryItem[]
    addItem: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void
    clearHistory: () => void
    removeItem: (id: string) => void
}

export const useHistoryStore = create<HistoryStore>()(
    persist(
        (set) => ({
            items: [],
            addItem: (item) =>
                set((state) => {
                    const newItem: HistoryItem = {
                        ...item,
                        id: crypto.randomUUID(),
                        timestamp: Date.now(),
                    }
                    // Keep only last 2000 items
                    const updatedItems = [newItem, ...state.items].slice(0, 2000)
                    return { items: updatedItems }
                }),
            clearHistory: () => set({ items: [] }),
            removeItem: (id) =>
                set((state) => ({
                    items: state.items.filter((item) => item.id !== id),
                })),
        }),
        {
            name: 'barcode-history-storage',
        }
    )
)

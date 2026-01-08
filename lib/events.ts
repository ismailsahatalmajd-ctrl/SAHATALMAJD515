export type StoreEvent = 'change' | 'products_change' | 'categories_change' | 'transactions_change' | 'branches_change' | 'issues_change' | 'returns_change' | 'branch_requests_change' | 'branch_invoices_change'
type Listener = () => void
const listeners = new Map<StoreEvent, Set<Listener>>()

export function subscribe(event: StoreEvent, callback: Listener) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)?.add(callback)
    return () => {
        listeners.get(event)?.delete(callback)
    }
}

export function notify(event: StoreEvent) {
    listeners.get(event)?.forEach(cb => cb())
    if (event !== 'change') listeners.get('change')?.forEach(cb => cb())
}

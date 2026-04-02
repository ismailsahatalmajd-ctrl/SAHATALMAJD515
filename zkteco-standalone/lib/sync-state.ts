export const pendingDeletes = new Set<string>();

export const markAsDeleting = (id: string) => {
    pendingDeletes.add(id);
    console.log(`[SyncState] Marked ${id} as deleting`);
};

export const unmarkAsDeleting = (id: string) => {
    pendingDeletes.delete(id);
    console.log(`[SyncState] Unmarked ${id} as deleting`);
};

export const isDeleting = (id: string) => pendingDeletes.has(id);

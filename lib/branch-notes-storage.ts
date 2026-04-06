import { db } from './db';
import type { BranchNote } from './types';
import { v4 as uuidv4 } from 'uuid';

export async function getBranchNotes(): Promise<BranchNote[]> {
  try {
    return await db.branchNotes.toArray();
  } catch (error) {
    console.error('Error fetching branch notes:', error);
    return [];
  }
}

export async function addBranchNote(note: Omit<BranchNote, 'id' | 'createdAt'>): Promise<BranchNote> {
  const newNote: BranchNote = {
    ...note,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };
  await db.branchNotes.add(newNote);
  return newNote;
}

export async function updateBranchNote(id: string, updates: Partial<BranchNote>): Promise<void> {
  await db.branchNotes.update(id, updates);
}

export async function deleteBranchNote(id: string): Promise<void> {
  await db.branchNotes.delete(id);
}

export async function getActiveNotesForBranch(branchId: string): Promise<BranchNote[]> {
  const now = new Date().toISOString();
  try {
    const allNotes = await db.branchNotes.toArray();
    return allNotes.filter(note => {
      const isNotExpired = note.expiresAt > now;
      const isTargeted = note.targetBranchIds.includes('all') || note.targetBranchIds.includes(branchId);
      return isNotExpired && isTargeted;
    });
  } catch (error) {
    console.error('Error fetching active notes:', error);
    return [];
  }
}

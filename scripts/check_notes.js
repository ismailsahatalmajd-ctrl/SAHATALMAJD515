const Dexie = require('dexie');

async function checkNotes() {
  const db = new Dexie('InventoryDB');
  db.version(14).stores({
    branchNotes: 'id, expiresAt, *targetBranchIds'
  });

  try {
    const notes = await db.branchNotes.toArray();
    console.log('Total notes:', notes.length);
    const now = new Date().toISOString();
    console.log('Current ISO time:', now);
    
    notes.forEach(note => {
      console.log('Note ID:', note.id);
      console.log('Content:', note.content);
      console.log('Expires:', note.expiresAt);
      console.log('Targets:', note.targetBranchIds);
      console.log('Is Expired?', note.expiresAt <= now);
      console.log('---');
    });
  } catch (e) {
    console.error('Error:', e);
  } finally {
    db.close();
  }
}

checkNotes();

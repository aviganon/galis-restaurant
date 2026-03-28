import { writeBatch, type Firestore, type DocumentReference } from "firebase/firestore"

/** מרווח בטיחות מתחת למגבלת 500 של Firestore */
export const FIRESTORE_SET_CHUNK_SIZE = 450

export async function commitSetWritesInChunks(
  db: Firestore,
  writes: Array<{ ref: DocumentReference; data: Record<string, unknown>; merge?: boolean }>,
): Promise<void> {
  const chunkSize = FIRESTORE_SET_CHUNK_SIZE
  for (let i = 0; i < writes.length; i += chunkSize) {
    const batch = writeBatch(db)
    for (const w of writes.slice(i, i + chunkSize)) {
      batch.set(w.ref, w.data, { merge: w.merge ?? true })
    }
    await batch.commit()
  }
}

import { db } from './db.js'

/** Ouvre la base IndexedDB (Dexie l'ouvre paresseusement de toute façon, mais on attend explicitement pour l'écran de chargement initial). */
export async function initDb() {
  await db.open()
  return db
}

export * from './repository.js'

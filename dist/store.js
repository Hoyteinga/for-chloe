// Local persistence. Replace this adapter when authenticated synchronisation is introduced.
//
// IndexedDB database "chloe-collection"
//   version 1: object store "apps"   — keys "tea", "world", "wish" (one record per app) and "meta"
//   version 2: object store "photos" — one record per uploaded photo (a JPEG data URL), keyed by id.
//              Items refer to stored photos as "idb:<id>". Older items may still hold an inline
//              data URL until app.js moves it across; both forms are read correctly.
//
// Photos and app records are always written in one transaction, so a save either lands completely
// or not at all.

const DB_NAME = "chloe-collection";
const DB_VERSION = 2;
let dbPromise;
export const openState = { blocked: false };

function open() {
  dbPromise ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("apps")) db.createObjectStore("apps");
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
    };
    r.onblocked = () => (openState.blocked = true);
    r.onsuccess = () => {
      const db = r.result;
      // A newer version opened elsewhere: step aside so it can upgrade, then reload into it.
      db.onversionchange = () => {
        db.close();
        location.reload();
      };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export const repository = {
  async read(key, fallback) {
    const db = await open();
    const value = await request(db.transaction("apps").objectStore("apps").get(key));
    return value ?? structuredClone(fallback);
  },
  async write(key, value) {
    return this.commit(key, value);
  },
  /** Writes an app record together with any photo additions and removals, atomically. */
  async commit(key, value, { put = [], remove = [] } = {}) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["apps", "photos"], "readwrite");
      const photos = tx.objectStore("photos");
      for (const [id, data] of put) photos.put(data, id);
      for (const id of remove) photos.delete(id);
      if (key) tx.objectStore("apps").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error("Save was interrupted"));
    });
  },
  async getPhoto(id) {
    const db = await open();
    return request(db.transaction("photos").objectStore("photos").get(id));
  },
};

/** Resizes a chosen photo to at most 1,600 px and returns a JPEG data URL. */
export async function photo(file) {
  if (!file) return "";
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", ""];
  if (!allowed.includes(file.type))
    throw Error("Please choose a JPEG, PNG or WebP photo. On iPhone, export HEIC as JPEG first.");
  if (file.size > 30000000) throw Error("Please choose a photo smaller than 30 MB.");
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    im.src = url;
    try {
      await im.decode();
    } catch {
      throw Error("This photo could not be opened here. Please choose a JPEG, PNG or WebP photo.");
    }
    const scale = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(im.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(im.naturalHeight * scale));
    const g = canvas.getContext("2d");
    g.fillStyle = "#ffffff"; // transparent PNGs would otherwise turn black as JPEG
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(im, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.85);
    if (!data.startsWith("data:image/jpeg")) throw Error("This photo could not be prepared on this device.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Whether the browser has agreed not to clear this site's storage, and roughly how much is used. */
export async function storageStatus() {
  const out = { supported: !!navigator.storage };
  try {
    out.persisted = await navigator.storage?.persisted?.();
  } catch {}
  try {
    const e = await navigator.storage?.estimate?.();
    out.usage = e?.usage;
    out.quota = e?.quota;
  } catch {}
  return out;
}

export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

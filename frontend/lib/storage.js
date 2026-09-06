// TEMPORARY: browser-only persistence until step 2 replaces this with real
// backend CRUD (see hooks/useGardenData.js for every call site).
const LOCAL_PREFIX = "myGnomie:";

export async function storageGet(key) {
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + key);
    return raw === null ? null : { key, value: raw };
  } catch {
    return null;
  }
}

export async function storageSet(key, value) {
  try {
    window.localStorage.setItem(LOCAL_PREFIX + key, value);
    return { key, value };
  } catch (err) {
    console.error("Local storage save failed", err);
    return null;
  }
}

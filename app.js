// Shell shared by the three apps: storage, photos, copies, sheets, navigation and routing.
// Each app (tea.js, world.js, wish.js) owns its screens, editor, details and actions.
import { createTea } from "./tea.js";
import { createWorld } from "./world.js";
import { createWish } from "./wish.js";
import { repository, photo, storageStatus, requestPersistence, openState } from "./store.js";
import { defaults, legacyExampleIds } from "./data.js";
import {
  APPS,
  PHOTO_PREFIX,
  changesSince,
  isInlinePhoto,
  isoDay,
  matchesQuery,
  mergeCollections,
  normaliseMeal,
  normaliseMemory,
  photoId,
  photoIds,
  validateBackup,
} from "./logic.js";

// ---------- Small helpers ----------

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const uid = () =>
  crypto.randomUUID?.() ||
  "id-" +
    Date.now().toString(36) +
    "-" +
    Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
const today = () => isoDay();
const nowIso = () => new Date().toISOString();
const asDate = (s) => new Date(String(s).slice(0, 10) + "T12:00:00");
const dateLabel = (s, opts = { day: "numeric", month: "long", year: "numeric" }) => {
  const d = asDate(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", opts);
};
const megabytes = (bytes) => (bytes < 1048576 ? "under 1 MB" : `${Math.round(bytes / 1048576)} MB`);
const money = (p) => {
  const n = Number(p);
  return Number.isInteger(n) ? `£${n.toLocaleString("en-GB")}` : `£${n.toFixed(2)}`;
};
const excerpt = (s, n = 170) => {
  const t = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n) > 80 ? t.lastIndexOf(" ", n) : n) + "…";
};
/** "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago" */
const ago = (iso) => {
  if (!iso) return "";
  const days = Math.floor((asDate(today()) - asDate(iso)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30.4)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const env = {
  ios:
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  standalone: navigator.standalone === true || matchMedia("(display-mode: standalone)").matches,
};

// ---------- State ----------

const ui = { app: "gallery", tab: "", query: "", filter: "All" };
let state = {},
  meta = { lastExport: {}, snooze: {} },
  pendingImport = null,
  pendingExport = null;
const modal = $("#modal");
const channel = "BroadcastChannel" in window ? new BroadcastChannel("chloe-collection") : null;

const nouns = { tea: ["meal", "meals"], world: ["memory", "memories"], wish: ["wish", "wishes"] };
const plural = (n, a = ui.app) => `${n} ${nouns[a][n === 1 ? 0 : 1]}`;

const btn = (text, action, cls = "secondary", data = "") =>
  `<button type="button" class="${cls}" data-action="${action}" ${data}>${text}</button>`;

function toast(msg) {
  $("#toast").textContent = msg;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 3200);
}

// ---------- Photos ----------
// Stored photos are loaded from IndexedDB only when they scroll near the screen,
// and a small cache keeps recently seen ones ready for re-renders.

const photoCache = new Map();
const PHOTO_CACHE_MAX = 80;
function remember(id, data) {
  photoCache.delete(id);
  photoCache.set(id, data);
  while (photoCache.size > PHOTO_CACHE_MAX) photoCache.delete(photoCache.keys().next().value);
}
async function loadPhoto(id) {
  if (photoCache.has(id)) {
    const data = photoCache.get(id);
    remember(id, data);
    return data;
  }
  const data = await repository.getPhoto(id);
  if (data) remember(id, data);
  return data;
}

function img(image, alt, cls = "") {
  if (!image) return "";
  const c = cls ? ` class="${cls}"` : "";
  const id = photoId(image);
  if (id) return `<img${c} src="${BLANK}" data-photo="${esc(id)}" alt="${esc(alt)}">`;
  const src = image.startsWith("/assets/") ? image.slice(1) : image;
  return `<img${c} src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`;
}

let observer;
function hydrate(root) {
  for (const im of root.querySelectorAll("img[data-photo]")) {
    const id = im.dataset.photo;
    if (photoCache.has(id)) {
      im.src = photoCache.get(id);
      im.removeAttribute("data-photo");
    } else if (root === modal || !("IntersectionObserver" in window)) fillPhoto(im);
    else (observer ||= new IntersectionObserver(onVisible, { rootMargin: "900px 0px" })).observe(im);
  }
}
function onVisible(entries) {
  for (const e of entries)
    if (e.isIntersecting) {
      observer.unobserve(e.target);
      fillPhoto(e.target);
    }
}
async function fillPhoto(im) {
  const id = im.dataset.photo;
  if (!id) return;
  im.removeAttribute("data-photo");
  try {
    const data = await loadPhoto(id);
    if (data) im.src = data;
    else im.classList.add("missing");
  } catch {
    im.classList.add("missing");
  }
}

// ---------- Saving ----------

function broadcast(a) {
  try {
    channel?.postMessage({ app: a });
  } catch {}
}

let persistenceAsked = false;
function afterUserSave() {
  if (persistenceAsked) return;
  persistenceAsked = true;
  requestPersistence();
}

/** In-place change that does not add or remove photos. Rolls back if the device refuses to save. */
async function mutate(change, message, a = ui.app) {
  const snapshot = structuredClone(state[a]);
  change(state[a]);
  try {
    await repository.commit(a, state[a]);
  } catch {
    state[a] = snapshot;
    toast("Couldn’t save on this device. Save a copy of your data before closing.");
    return false;
  }
  broadcast(a);
  if (message) toast(message);
  return true;
}

/** Replaces an app's record, storing new photos and removing ones no longer referenced, in one go. */
async function commitApp(a, next, put = []) {
  const keep = photoIds(next.items);
  const remove = [...photoIds(state[a].items)].filter((id) => !keep.has(id));
  await repository.commit(a, next, { put, remove });
  state[a] = next;
  for (const id of remove) photoCache.delete(id);
  for (const [id, data] of put) if (put.length <= 4) remember(id, data);
  broadcast(a);
}

/** Moves inline photo data into the photo store. Returns the rewritten data and the photos to write. */
function internalise(data) {
  const put = [];
  const items = data.items.map((i) => {
    if (!isInlinePhoto(i.image)) return i;
    const id = uid();
    put.push([id, i.image]);
    return { ...i, image: PHOTO_PREFIX + id };
  });
  return { data: { ...data, items }, put };
}

async function saveMeta() {
  try {
    await repository.write("meta", meta);
  } catch {}
}

// ---------- Building blocks shared by the apps ----------

function sheet(title, html, cls = "") {
  modal.className = cls;
  modal.innerHTML = `<div class="sheet-head"><h2 id="dialog-title">${title}</h2>${btn("×", "close", "close", 'aria-label="Close"')}</div>${html}`;
  modal.setAttribute("aria-labelledby", "dialog-title");
  if (!modal.open) modal.showModal();
  hydrate(modal);
  modal.querySelector("[autofocus]")?.focus();
}
const closeSheet = () => modal.open && modal.close();
const empty = (title, copy, action = "", label = "", data = "") =>
  `<div class="empty"><h3>${title}</h3>${copy ? `<p>${copy}</p>` : ""}${action ? btn(label, action, "primary", data) : ""}</div>`;
function confirmSheet(title, copy, action, id = "", yes = "Yes, continue") {
  sheet(
    title,
    `<p class="gap">${copy}</p><div class="detail-actions">${btn("Keep it", "close")}${btn(yes, action, "primary", `data-id="${esc(id)}"`)}</div>`,
  );
}
function searchbar(placeholder = "Search…", add = "") {
  return `<div class="toolbar"><input id="search" type="search" aria-label="Search" placeholder="${placeholder}" value="${esc(ui.query)}" autocomplete="off" enterkeyhint="search">${add}</div>`;
}
function chips(values, labels = {}) {
  return `<div class="chips" aria-label="Filters">${values.map((x) => btn(esc(labels[x] || x), "filter", `pill ${ui.filter === x ? "active" : ""}`, `data-value="${esc(x)}" aria-pressed="${ui.filter === x}"`)).join("")}</div>`;
}
const options = (arr, val) =>
  arr
    .map((x) => {
      const [v, l] = Array.isArray(x) ? x : [x, x];
      return `<option value="${esc(v)}" ${String(v) === String(val ?? "") ? "selected" : ""}>${esc(l)}</option>`;
    })
    .join("");
function select(name, label, arr, val, extra = "") {
  return `<label class="field">${label}<select name="${name}" ${extra}>${options(arr, val)}</select></label>`;
}
function field(name, label, value = "", type = "text", extra = "") {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value ?? "")}" ${type === "number" ? 'min="0" step="any" inputmode="decimal"' : ""} maxlength="250" ${extra}></label>`;
}
function area(name, label, value = "", extra = "") {
  return `<label class="field span">${label}<textarea name="${name}" maxlength="20000" ${extra}>${esc(value ?? "")}</textarea></label>`;
}
/** Single-choice buttons that are real radio inputs, so they work with the keyboard and FormData. */
function pills(name, label, values, current, extra = "") {
  return `<fieldset class="pills" ${extra}><legend>${label}</legend><div>${values
    .map((x) => {
      const [v, l] = Array.isArray(x) ? x : [x, x];
      return `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(current ?? "") ? "checked" : ""}><span>${esc(l)}</span></label>`;
    })
    .join("")}</div></fieldset>`;
}
function photoField(i, label = "Photo (optional)") {
  return `<div class="field span photo-field"><span>${label}</span><div class="photo-pick">${i.image ? img(i.image, "Current photo", "photo-preview") : '<img class="photo-preview" alt="" hidden>'}<label class="secondary file-button">${i.image ? "Change photo" : "Choose a photo"}<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label></div><small>Stays on this device. Resized to 1,600 pixels.</small>${i.image ? '<label class="check"><input name="removePhoto" type="checkbox">Remove this photo</label>' : ""}</div>`;
}
const sample = (i) => (i.sample ? '<span class="sample">Example</span>' : "");

/** Examples guide an empty app and step aside once there is real content. */
function visible(items) {
  const own = items.filter((i) => !i.sample);
  return own.length ? own : items;
}
const examplesShowing = (a = ui.app) =>
  state[a].items.some((i) => i.sample) && !state[a].items.some((i) => !i.sample);
const examplesHidden = (a = ui.app) =>
  state[a].items.some((i) => i.sample) && state[a].items.some((i) => !i.sample);
const matches = (i, extra = "") => matchesQuery(ui.app, i, ui.query, extra);

// ---------- Layout ----------

const icons = {
  choose: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  meals: '<path d="M4 3h13a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 14h14M7 7h9M7 10h6"/>',
  week: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h3m4 0h3"/>',
  list: '<path d="m3 6 2 2 3-4m3 3h10M3 13h3m5 0h10M3 19h3m5 0h10"/>',
  settings: '<circle cx="12" cy="12" r="8"/><path d="M12 10v7m0-11v1"/>',
  timeline: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 3v18m3-13h6m-6 5h6"/>',
  said: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9h8m-8 3h5"/>',
  ages: '<path d="M4 20V10m6 10V6m6 14v-7m4 7H2"/>',
  gallery:
    '<rect x="3" y="3" width="7" height="10"/><rect x="14" y="3" width="7" height="6"/><rect x="3" y="17" width="7" height="4"/><rect x="14" y="13" width="7" height="8"/>',
  collections: '<path d="M3 4h7l2 3h9v14H3Z"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
};

const titles = { tea: "What’s for Tea?", world: "Sophia’s Little World", wish: "The Little Wishlist" };
const themeColours = { tea: "#f7f3eb", world: "#f6f3ed", wish: "#f6eeea", gallery: "#f7f3eb" };

function nav() {
  return `<nav class="nav" aria-label="App navigation">${mod()
    .tabs.map(
      ([v, t]) =>
        `<button type="button" data-tab="${v}" class="${ui.tab === v ? "active" : ""}" ${ui.tab === v ? 'aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${icons[v]}</svg>${t}</button>`,
    )
    .join("")}</nav>`;
}

function render() {
  document.body.className = ui.app === "gallery" ? "home" : ui.app;
  document.title = titles[ui.app] || "For Chloe";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColours[ui.app]);
  observer?.disconnect();
  if (ui.app === "gallery") {
    gallery();
    return;
  }
  $("#app").innerHTML =
    `<main class="shell"><header class="top"><a class="back" href="#">← All three</a><span class="brand">${titles[ui.app]}</span></header>${ui.tab !== "settings" ? reminder() : ""}${mod().view()}</main>${nav()}`;
  hydrate($("#app"));
  if (ui.tab === "settings") fillStorageStatus();
}

/** Updates only the results while typing, so the search box (and the iPhone keyboard) stays put. */
function refreshResults() {
  const cur = $("#results");
  const tpl = document.createElement("template");
  tpl.innerHTML = mod().view();
  const next = tpl.content.querySelector("#results");
  if (!cur || !next) return render();
  cur.replaceWith(next);
  hydrate(next);
}

function setTab(t) {
  ui.tab = t;
  ui.query = "";
  ui.filter = mod().defaultFilter?.(t) ?? "All";
  closeSheet();
  render();
  window.scrollTo(0, 0);
}

const ownEntries = () => APPS.some((a) => state[a]?.items.some((i) => !i.sample));

function installNote() {
  if (!env.ios || env.standalone) return "";
  return `<div class="notice install"><strong>Add it to your Home Screen first.</strong> In Safari, tap Share, then <em>Add to Home Screen</em>, and open it from the new icon. Safari can clear data for sites you haven’t visited for a while, and the Home Screen version keeps its own separate copy.${ownEntries() ? "<br><br>You’ve already added things in this Safari tab. They won’t move across by themselves: save a copy from each app’s settings here, then restore it in the Home Screen version." : ""}</div>`;
}

function gallery() {
  $("#app").innerHTML =
    `<main class="gallery"><header><h1>For Chloe<span class="dot-accent">.</span></h1><p>Three small apps, made for you.</p></header>${installNote()}<div class="gift-grid"><a class="gift" href="#tea"><div class="gift-art"><img src="assets/pasta.jpg" alt="" /></div><div class="gift-copy"><h2>What’s for Tea?</h2><p>Pick tonight’s tea in a minute, plan the week and sort the shopping.</p></div></a><a class="gift gift-world" href="#world"><div class="gift-art"><div class="book-art"><span>Sophia</span><small>things she says and does</small></div></div><div class="gift-copy"><h2>Sophia’s Little World</h2><p>Things she says and does, kept with the date and a photo.</p></div></a><a class="gift gift-wish" href="#wish"><div class="gift-art"><img src="assets/flowers.jpg" alt="" /></div><div class="gift-copy"><h2>The Little Wishlist</h2><p>Things you’ve seen, places to go and ideas to come back to.</p></div></a></div><p class="small foot">Everything you add stays on this phone and is never uploaded. Save a copy from each app’s settings now and then.</p></main>`;
}

/** A gentle nudge when there are changes that exist nowhere but this device. */
function reminder() {
  const a = ui.app;
  const last = meta.lastExport?.[a] || "";
  const changed = changesSince(state[a].items, last);
  if (!changed || (meta.snooze?.[a] || "") > nowIso()) return "";
  // Not on the day you start. Nudge once five unsaved changes are a couple of days old,
  // or once any unsaved change is a fortnight old.
  const since = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);
  const oldest = state[a].items
    .filter((i) => !i.sample && (!last || (i.updated || "") > last))
    .reduce((m, i) => Math.max(m, since(i.updated)), 0);
  if (!((changed >= 5 && oldest >= 2) || oldest >= 14)) return "";
  return `<div class="notice reminder" role="note"><div><strong>Save a copy?</strong> ${plural(changed)} only exist${changed === 1 ? "s" : ""} on this phone so far.</div><div class="row wrap">${btn("Save a copy", "export", "primary")}${btn("Later", "snooze", "textbtn")}</div></div>`;
}

/** The "keeping it safe" block every app's settings page shares. */
function keepingSafe() {
  const last = meta.lastExport?.[ui.app];
  return `<section class="about stack"><h2 class="section-h">Keeping it safe</h2><div class="notice"><strong>Saved on this phone only.</strong> Nothing is uploaded. Browser storage isn’t a dependable long-term backup: clearing website data, changing phones or losing this one can lose entries. Save a copy now and then and keep it in Files or iCloud Drive.</div>${installNote()}<div class="notice status" id="storage-status"><div>Last copy saved: <strong>${last ? dateLabel(last) : "not yet"}</strong></div><div data-slot="persist">Checking this browser’s storage…</div></div><div class="row wrap">${btn("Save a copy", "export")}${btn("Restore or combine", "import")}</div><p class="small">Restoring asks whether to combine a copy with what’s here or replace it, and checks before changing anything. Copies aren’t encrypted, so keep them private.</p>${
    state[ui.app].items.some((i) => i.sample)
      ? `<p class="small">${examplesHidden() ? "The examples are hidden now you’ve added your own." : "The examples disappear when you add your own."} ${btn("Remove examples", "clear-samples", "textbtn")}</p>`
      : ""
  }</section>`;
}
async function fillStorageStatus() {
  const s = await storageStatus();
  const slot = document.querySelector('#storage-status [data-slot="persist"]');
  if (!slot) return;
  const used = s.usage !== undefined ? ` Everything here uses ${megabytes(s.usage)}.` : "";
  slot.innerHTML =
    s.persisted === true
      ? `This browser has agreed to keep the data rather than clear it when space runs low.${used}`
      : s.persisted === false
        ? `This browser may clear the data if the phone runs low on space.${used} ${btn("Ask to keep it", "persist", "textbtn")}`
        : `This browser doesn’t say whether it will keep the data.${used}`;
}

// ---------- Copies: export, restore, combine ----------

/** Builds the v1 JSON backup in pieces so large photo collections never become one giant string. */
async function buildBackup(a) {
  const { items, ...rest } = state[a];
  const restJson = JSON.stringify(rest).slice(1, -1);
  let blob = new Blob([]);
  let parts = [
    `{"format":"chloe-app-backup","version":1,"app":${JSON.stringify(a)},"exported":${JSON.stringify(nowIso())},"data":{${restJson ? restJson + "," : ""}"items":[`,
  ];
  let photos = 0,
    missing = 0;
  for (let k = 0; k < items.length; k++) {
    let item = items[k];
    const id = photoId(item.image);
    if (id) {
      const data = photoCache.get(id) || (await repository.getPhoto(id));
      if (data) photos++;
      else missing++;
      item = { ...item, image: data || "" };
    } else if (isInlinePhoto(item.image)) photos++;
    parts.push((k ? "," : "") + JSON.stringify(item));
    if (parts.length >= 20) {
      blob = new Blob([blob, ...parts]);
      parts = [];
    }
  }
  parts.push("]}}");
  return {
    blob: new Blob([blob, ...parts], { type: "application/json" }),
    count: items.length,
    photos,
    missing,
  };
}

async function exportData() {
  sheet(
    "Save a copy",
    `<div class="busy"><span class="spinner">✳</span><p>Getting everything together, photos too…</p></div>`,
  );
  try {
    const { blob, count, photos, missing } = await buildBackup(ui.app);
    const name = `${ui.app}-backup-${today()}.json`;
    const file = new File([blob], name, { type: "application/json" });
    if (pendingExport?.url) URL.revokeObjectURL(pendingExport.url);
    pendingExport = { file, name, url: URL.createObjectURL(blob), app: ui.app };
    let canShare = false;
    try {
      canShare = !!navigator.canShare?.({ files: [file] });
    } catch {}
    // In a Home Screen app on iPhone, a download opens a preview with no way back, so share instead.
    const offerDownload = !(canShare && env.ios);
    sheet(
      "Your copy is ready",
      `<p class="gap">${plural(count)}${photos ? `, ${photos} photo${photos === 1 ? "" : "s"}` : ""} · ${megabytes(blob.size)}</p>${missing ? `<p class="small danger gap">${missing} photo${missing === 1 ? " was" : "s were"} missing on this phone and couldn’t be included.</p>` : ""}<p class="small gap">${canShare && env.ios ? "Choose <em>Save to Files</em> to keep it, or AirDrop it to another phone." : "Download it and keep it somewhere safe, such as Files or iCloud Drive."} It isn’t encrypted, so keep it private.</p><div class="detail-actions">${canShare ? btn(env.ios ? "Save or send ↗" : "Share ↗", "share-export", "primary") : ""}${offerDownload ? `<a class="${canShare ? "secondary" : "primary"} button-link" href="${pendingExport.url}" download="${esc(name)}" data-action="downloaded">Download</a>` : ""}</div>`,
    );
  } catch {
    sheet(
      "That didn’t work",
      `<p class="gap">The copy couldn’t be made on this phone. Try again, or free up some space first.</p>`,
    );
  }
}

async function markExported(a) {
  meta.lastExport = { ...(meta.lastExport || {}), [a]: nowIso() };
  await saveMeta();
}

function importSheet() {
  sheet(
    "Restore or combine",
    `<p class="small gap">Choose a copy saved from ${titles[ui.app]}. Nothing changes until you confirm.</p><form id="import-form" class="stack gap"><input aria-label="Saved copy" type="file" name="backup" accept="application/json,.json" required><p id="import-error" class="danger small" role="alert"></p><button class="primary">Check this copy</button></form>`,
  );
}

function importChoice(p) {
  const n = pendingImport.items.filter((i) => !i.sample).length;
  const photos = pendingImport.items.filter((i) => isInlinePhoto(i.image)).length;
  const when = p.exported ? dateLabel(p.exported) : "";
  sheet(
    "Combine or replace?",
    `<p class="gap">This copy${when ? ` was saved on ${when} and` : ""} has ${plural(pendingImport.items.length)}${photos ? ` and ${photos} photo${photos === 1 ? "" : "s"}` : ""}.</p><div class="choice gap"><h3>Combine</h3><p class="small">Adds any of the copy’s ${plural(n)} that aren’t here yet, keeps the most recently edited version of anything on both, and carries deletions across. Examples are left out. Use this to bring two phones together.</p>${btn("Combine with what’s here", "merge-confirmed", "primary")}</div><div class="choice gap"><h3>Replace</h3><p class="small">Makes this app match the copy exactly. Anything here that isn’t in the copy will be lost.</p>${btn("Replace everything here", "replace-ask", "secondary")}</div>`,
  );
}

// ---------- The apps ----------

const core = {
  get state() {
    return state;
  },
  get meta() {
    return meta;
  },
  ui,
  modal,
  env,
  $,
  esc,
  uid,
  today,
  nowIso,
  asDate,
  dateLabel,
  money,
  excerpt,
  ago,
  plural,
  btn,
  empty,
  chips,
  searchbar,
  select,
  field,
  area,
  pills,
  photoField,
  img,
  sample,
  visible,
  examplesShowing,
  examplesHidden,
  matches,
  sheet,
  closeSheet,
  confirmSheet,
  toast,
  render,
  refreshResults,
  setTab,
  mutate,
  commitApp,
  saveMeta,
  keepingSafe,
};
const modules = { tea: createTea(core), world: createWorld(core), wish: createWish(core) };
const mod = () => modules[ui.app];

// ---------- Events ----------

$("#app").addEventListener("input", (e) => {
  if (e.target.id === "search") {
    ui.query = e.target.value;
    refreshResults();
  }
});
modal.addEventListener("input", (e) => {
  const form = e.target.form;
  if (form?.id === "edit-form") form.dataset.dirty = "1";
  mod()?.onInput?.(e);
});
// Don't lose half-written words to a stray tap or the Escape key.
modal.addEventListener("cancel", (e) => {
  if (modal.querySelector("#edit-form[data-dirty]")) {
    e.preventDefault();
    const err = modal.querySelector("#form-error");
    if (err) err.textContent = "You have unsaved changes. Save them, or tap × twice to discard.";
  }
});
modal.addEventListener("click", (e) => {
  if (e.target !== modal || modal.querySelector("#edit-form")) return;
  const r = modal.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close();
});

document.addEventListener("change", async (e) => {
  if (e.target.name === "photo" && e.target.form?.id === "edit-form") {
    const file = e.target.files?.[0];
    const preview = e.target.form.querySelector(".photo-preview");
    e.target.form.dataset.dirty = "1";
    if (file && preview) {
      if (preview.dataset.url) URL.revokeObjectURL(preview.dataset.url);
      preview.dataset.url = URL.createObjectURL(file);
      preview.removeAttribute("data-photo");
      preview.src = preview.dataset.url;
      preview.hidden = false;
    }
    return;
  }
  await mod()?.onChange?.(e);
});

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action],[data-open],[data-tab]");
  if (!el) return;
  if (el.dataset.tab) {
    setTab(el.dataset.tab);
    return;
  }
  if (el.dataset.open) {
    mod().detail(el.dataset.open, el.dataset);
    return;
  }
  const a = el.dataset.action,
    id = el.dataset.id,
    i = state[ui.app]?.items.find((x) => x.id === id);

  // Must stay synchronous until navigator.share is called, or iPhone treats it as unrequested.
  if (a === "share-export") {
    const pe = pendingExport;
    if (!pe) return;
    try {
      await navigator.share({ files: [pe.file], title: pe.name });
      await markExported(pe.app);
      closeSheet();
      toast("Copy saved. Keep it somewhere safe.");
      render();
    } catch (err) {
      if (err?.name !== "AbortError") toast("Sharing didn’t work here. Try again, or use Download.");
    }
    return;
  }
  if (a === "downloaded") {
    await markExported(pendingExport?.app || ui.app);
    setTimeout(() => {
      closeSheet();
      render();
      toast("Copy saved. Keep it somewhere safe.");
    }, 400);
    return;
  }
  if (a === "close") {
    const form = modal.querySelector("#edit-form[data-dirty]");
    if (form && !el.dataset.armed) {
      el.dataset.armed = "1";
      modal.querySelector("#form-error").textContent =
        "You have unsaved changes. Tap × again to discard them.";
      return;
    }
    closeSheet();
    return;
  }
  if (a === "add" || a === "edit") {
    mod().editor(a === "edit" ? id : null, el.dataset);
    return;
  }
  if (a === "filter") {
    ui.filter = el.dataset.value;
    closeSheet();
    render();
    return;
  }
  if (a === "favourite" && i) {
    await mutate(
      () => {
        i.favourite = !i.favourite;
        i.updated = nowIso();
      },
      i.favourite ? "Taken out of favourites" : "Added to favourites",
    );
    if (modal.open) mod().detail(id);
    if (document.activeElement?.id === "search") refreshResults();
    else render();
    return;
  }
  if (a === "delete") {
    confirmSheet(
      "Delete this?",
      "It will be removed from this phone. This can’t be undone.",
      "delete-confirmed",
      id,
      "Delete",
    );
    return;
  }
  if (a === "delete-confirmed") {
    const t = state[ui.app];
    let next = { ...t, items: t.items.filter((x) => x.id !== id) };
    if (i && !i.sample) next.deleted = { ...(t.deleted || {}), [id]: nowIso() };
    next = mod().onDelete?.(next, id) || next;
    try {
      await commitApp(ui.app, next);
      toast("Deleted");
    } catch {
      toast("Couldn’t save on this device. Save a copy of your data before closing.");
    }
    closeSheet();
    render();
    return;
  }
  if (a === "export") {
    exportData();
    return;
  }
  if (a === "snooze") {
    meta.snooze = { ...(meta.snooze || {}), [ui.app]: new Date(Date.now() + 7 * 86400000).toISOString() };
    await saveMeta();
    render();
    return;
  }
  if (a === "persist") {
    const ok = await requestPersistence();
    toast(
      ok
        ? "This browser will keep the data."
        : "This browser decides for itself, so saving copies matters more.",
    );
    fillStorageStatus();
    return;
  }
  if (a === "import") {
    importSheet();
    return;
  }
  if (a === "replace-ask") {
    confirmSheet(
      "Replace what’s here?",
      `The copy has ${plural(pendingImport?.items.length || 0)}. Everything currently in this app will be replaced. Save a copy first if you want to keep it.`,
      "restore-confirmed",
      "",
      "Replace",
    );
    return;
  }
  if (a === "restore-confirmed") {
    if (!pendingImport) return;
    const { data, put } = internalise(normaliseApp(ui.app, pendingImport));
    try {
      await commitApp(ui.app, data, put);
      toast("Copy restored");
    } catch {
      toast("There isn’t room to restore this copy here. Nothing has changed.");
    }
    pendingImport = null;
    closeSheet();
    render();
    return;
  }
  if (a === "merge-confirmed") {
    if (!pendingImport) return;
    const result = mergeCollections(state[ui.app], normaliseApp(ui.app, pendingImport), ui.app);
    const { data, put } = internalise(result.data);
    try {
      await commitApp(ui.app, data, put);
      const bits = [
        `${result.added} added`,
        `${result.updated} updated`,
        result.removed ? `${result.removed} removed` : "",
      ].filter(Boolean);
      sheet(
        "Combined",
        `<p class="gap">${bits.join(", ")}.</p><p class="small gap">${result.added + result.updated + result.removed ? "Everything else stayed as it was." : "This phone already had everything in that copy."}</p><div class="detail-actions">${btn("Done", "close", "primary")}</div>`,
      );
    } catch {
      toast("There isn’t room to combine this copy here. Nothing has changed.");
      closeSheet();
    }
    pendingImport = null;
    render();
    return;
  }
  if (a === "clear-samples") {
    confirmSheet(
      "Remove the examples?",
      "Only entries marked Example are removed. Yours stay.",
      "clear-confirmed",
      "",
      "Remove examples",
    );
    return;
  }
  if (a === "clear-confirmed") {
    const t = state[ui.app];
    let next = { ...t, items: t.items.filter((x) => !x.sample) };
    next = mod().onClearSamples?.(next) || next;
    try {
      await commitApp(ui.app, next);
      toast("Examples removed");
    } catch {
      toast("Couldn’t save on this device. Save a copy of your data before closing.");
    }
    closeSheet();
    render();
    return;
  }
  await mod()?.actions?.[a]?.(el, i, e);
});

document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target,
    d = new FormData(f);
  if (f.id === "import-form") {
    const errorEl = $("#import-error");
    const button = f.querySelector("button");
    try {
      const file = d.get("backup");
      if (!file?.size) throw Error("Choose a saved copy first.");
      if (file.size > 500000000) throw Error("This file is too large to restore here.");
      if (file.size > 150000000) {
        button.disabled = true;
        button.textContent = "Reading a large copy…";
      }
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw Error("This file isn’t a saved copy from the collection.");
      }
      pendingImport = validateBackup(parsed, ui.app);
      importChoice(parsed);
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message;
      button.disabled = false;
      button.textContent = "Check this copy";
    }
    return;
  }
  if (f.id === "edit-form") {
    const button = f.querySelector("button.primary");
    button.disabled = true;
    const label = button.textContent;
    button.textContent = "Saving…";
    try {
      const existing = state[ui.app].items.find((x) => x.id === f.dataset.id);
      let entry = {
        ...existing,
        ...Object.fromEntries(
          [...d].filter(([k, v]) => !["photo", "removePhoto"].includes(k) && typeof v === "string"),
        ),
      };
      entry.id = existing?.id || uid();
      entry.sample = false;
      entry.updated = nowIso();
      entry.image = d.has("removePhoto") ? "" : existing?.image || "";
      const put = [];
      const file = d.get("photo");
      if (file?.size) {
        const data = await photo(file);
        const pid = uid();
        put.push([pid, data]);
        entry.image = PHOTO_PREFIX + pid;
      }
      entry = mod().prepare(entry, d, existing);
      const t = state[ui.app];
      const next = {
        ...t,
        items: existing ? t.items.map((x) => (x.id === entry.id ? entry : x)) : [entry, ...t.items],
      };
      try {
        await commitApp(ui.app, next, put);
      } catch {
        throw Error("Storage is full or unavailable. Try a smaller photo, or save a copy of your data.");
      }
      closeSheet();
      const after = mod().saved?.(entry, !existing);
      if (after !== false) render();
      toast(mod().savedMessage?.(entry, !existing) || "Saved");
      navigator.vibrate?.(15);
      afterUserSave();
    } catch (err) {
      $("#form-error").textContent = err.message;
      button.disabled = false;
      button.textContent = label;
    }
    return;
  }
  const handler = mod()?.forms?.[f.id];
  if (handler) {
    await handler(f, d);
    afterUserSave();
  }
});

// ---------- Routing and start-up ----------

function route() {
  const next = location.hash.slice(1).split("/")[0];
  ui.app = APPS.includes(next) ? next : "gallery";
  ui.tab = ui.app === "gallery" ? "" : mod().defaultTab;
  ui.query = "";
  ui.filter = ui.app === "gallery" ? "All" : (mod().defaultFilter?.(ui.tab) ?? "All");
  closeSheet();
  render();
  window.scrollTo(0, 0);
}

/** Brings records from earlier versions into the current shape (in memory; saved with the next change). */
function normaliseApp(a, data) {
  if (a === "tea") return { ...data, items: data.items.map(normaliseMeal) };
  if (a === "world") return { ...data, items: data.items.map(normaliseMemory) };
  return data;
}

/** One-off clean-ups for data saved by earlier versions. */
async function upgradeSavedData() {
  // Version 2: photos move out of the app record into their own store.
  for (const a of APPS) {
    if (!state[a].items.some((i) => isInlinePhoto(i.image))) continue;
    const { data, put } = internalise(state[a]);
    try {
      await repository.commit(a, data, { put });
      state[a] = data;
    } catch (err) {
      // Inline photos still display and save as before; the move is retried on the next launch.
      console.warn("Photo move postponed", err);
    }
  }
  // Version 3: swap the old cookbook and essay-style examples (only if untouched) for the new ones.
  if (!meta.examplesV3) {
    try {
      for (const a of ["tea", "world"]) {
        const old = new Set(legacyExampleIds[a]);
        // Examples someone has planned or marked as cooked are kept; the rest are swapped out.
        const used = new Set(
          a === "tea" ? [...Object.values(state.tea.plan || {}), ...Object.keys(state.tea.cooked || {})] : [],
        );
        const stale = state[a].items.filter((i) => i.sample === true && old.has(i.id) && !used.has(i.id));
        if (!stale.length) continue;
        let items = state[a].items.filter((i) => !stale.includes(i));
        if (!items.length) items = structuredClone(defaults[a].items);
        const next = { ...state[a], items };
        if (a === "tea") {
          const gone = new Set(stale.map((i) => i.id));
          next.plan = Object.fromEntries(
            Object.entries(state.tea.plan || {}).filter(([, id]) => !gone.has(id)),
          );
          next.cooked = Object.fromEntries(
            Object.entries(state.tea.cooked || {}).filter(([id]) => !gone.has(id)),
          );
        }
        await repository.commit(a, next);
        state[a] = next;
      }
      meta.examplesV3 = true;
      await saveMeta();
    } catch (err) {
      console.warn("Example update postponed", err);
    }
  }
  for (const a of APPS) state[a] = normaliseApp(a, state[a]);
}

channel?.addEventListener("message", async (e) => {
  const a = e.data?.app;
  if (!APPS.includes(a)) return;
  try {
    state[a] = normaliseApp(a, await repository.read(a, defaults[a]));
    if (a === ui.app && !modal.open) {
      if (document.activeElement?.id === "search") refreshResults();
      else render();
    }
  } catch {}
});

const slow = setTimeout(() => {
  if (openState.blocked)
    $("#app").innerHTML =
      '<main class="gallery"><h1>Almost there.</h1><p>The collection is open in another tab or window. Close it, then reload this page.</p></main>';
}, 4000);
try {
  for (const key of APPS) state[key] = await repository.read(key, defaults[key]);
  meta = { lastExport: {}, snooze: {}, ...(await repository.read("meta", {})) };
  clearTimeout(slow);
  await upgradeSavedData();
  route();
} catch (err) {
  clearTimeout(slow);
  console.error(err);
  $("#app").innerHTML =
    '<main class="gallery"><h1>Couldn’t open the saved data.</h1><p>Use a normal Safari tab (not a private one) with website data allowed, then reload. Nothing has been reset.</p></main>';
}
window.addEventListener("hashchange", route);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

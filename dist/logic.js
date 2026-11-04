// Pure logic with no DOM or storage access. Shared by the apps and tested by checks.cjs.

export const APPS = ["tea", "world", "wish"];
export const ID_RE = /^[a-zA-Z0-9_-]+$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PHOTO_PREFIX = "idb:";
const ASSET_RE = /^\/?assets\/[a-z]+\.jpg$/;
const INLINE_RE = /^data:image\/(jpeg|png|webp);base64,/;
const DAY = 86400000;

export const isInlinePhoto = (image) => typeof image === "string" && image.startsWith("data:");
export const isStoredPhoto = (image) => typeof image === "string" && image.startsWith(PHOTO_PREFIX);
export const photoId = (image) => (isStoredPhoto(image) ? image.slice(PHOTO_PREFIX.length) : null);

/** Every stored-photo id referenced by a list of items. */
export function photoIds(items = []) {
  const ids = new Set();
  for (const i of items) {
    const id = photoId(i.image);
    if (id) ids.add(id);
  }
  return ids;
}

export function safeUrl(s) {
  try {
    const u = new URL(s);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}

/** Accepts "etsy.com/thing" as well as full links. */
export function tidyLink(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return safeUrl(t);
  return /^[^\s/]+\.[^\s/]+/.test(t) ? safeUrl("https://" + t) : "";
}

export function linkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shortText(s, n = 60) {
  const t = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n);
  return t.slice(0, cut > n / 2 ? cut : n) + "…";
}

// ---------- What's for Tea? ----------

export const EFFORTS = ["Hardly any", "Easy", "Some cooking"];
export const MEAL_SORTS = ["Cooked", "Shortcut", "Freezer", "No cooking", "Takeaway"];

/** Everyday teas offered as a tap-to-add list. They are prompts, not assumptions about what anyone eats. */
export const EVERYDAY_TEAS = [
  ["Spag bol", "Some cooking", "Cooked"],
  ["Chilli", "Some cooking", "Cooked"],
  ["Chicken fajitas", "Easy", "Cooked"],
  ["Chicken wraps", "Easy", ""],
  ["Jacket potatoes", "Easy", ""],
  ["Sausage and mash", "Some cooking", "Cooked"],
  ["Pasta bake", "Easy", "Cooked"],
  ["Stir fry", "Easy", "Cooked"],
  ["Curry", "Some cooking", ""],
  ["Cottage pie", "Some cooking", "Cooked"],
  ["Lasagne", "Some cooking", ""],
  ["Roast dinner", "Some cooking", "Cooked"],
  ["Burgers", "Easy", ""],
  ["Salmon, rice and veg", "Easy", "Cooked"],
  ["Omelette", "Easy", "Cooked"],
  ["Soup and bread", "Hardly any", ""],
  ["Beans on toast", "Hardly any", ""],
  ["Cheese toasties", "Hardly any", ""],
  ["Pizza", "Hardly any", "Freezer"],
  ["Fish fingers, chips and peas", "Hardly any", "Freezer"],
  ["Chicken nuggets and chips", "Hardly any", "Freezer"],
  ["Leftovers", "Hardly any", "No cooking"],
  ["Takeaway", "Hardly any", "Takeaway"],
].map(([title, effort, sort]) => ({ title, effort, sort }));

/** Brings meals saved by earlier versions into the current shape without losing anything. */
export function normaliseMeal(m) {
  const effort = m.effort === "A little cooking" ? "Some cooking" : m.effort || "";
  const list = m.list === "try" ? "try" : "regular";
  return effort === m.effort && list === m.list ? m : { ...m, effort, list };
}

/** Splits "200 g | pasta" lines. Lines without a bar are kept whole. */
export function parseIngredientLines(text) {
  return String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [amount, rawName] = line.split("|").map((x) => x.trim());
      return { line, amount, rawName, name: (rawName || amount).toLowerCase() };
    });
}

export const hasShopping = (meal) => parseIngredientLines(meal.ingredients).length > 0;

/** Ingredient totals for the planned days. Keys are stable so saved ticks keep working. */
export function shoppingItems(items, plan, days) {
  const map = new Map();
  for (const day of days) {
    const recipe = items.find((i) => i.id === plan[day]);
    if (!recipe) continue;
    for (const { amount, rawName, name } of parseIngredientLines(recipe.ingredients)) {
      const match = rawName && amount.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
      const unit = match ? match[2].toLowerCase() : "";
      const key = `${name}|${match ? unit : amount}`;
      if (map.has(key) && match) map.get(key).qty += Number(match[1]);
      else if (!map.has(key))
        map.set(key, { key, name, qty: match ? Number(match[1]) : null, unit, raw: rawName ? amount : "" });
    }
  }
  return [...map.values()].map((x) => ({
    ...x,
    label: `${x.qty !== null ? `${Math.round(x.qty * 100) / 100} ${x.unit}` : x.raw} ${x.name}`.trim(),
  }));
}

/** Planned meals in the coming days that have no shopping items saved. */
export function mealsWithoutShopping(items, plan, days) {
  const out = [];
  for (const day of days) {
    const meal = items.find((i) => i.id === plan[day]);
    if (meal && !hasShopping(meal) && meal.sort !== "Takeaway") out.push({ day, meal });
  }
  return out;
}

export function exclusionList(exclude) {
  return String(exclude ?? "")
    .split(/,|\band\b|\n/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

/** Matches excluded words against the meal name and ingredient names, not quantities or units. */
export function excludedBy(recipe, exclude) {
  const words = exclusionList(exclude);
  if (!words.length) return false;
  const text = [recipe.title, ...parseIngredientLines(recipe.ingredients).map((l) => l.name)]
    .join("\n")
    .toLowerCase();
  return words.some((w) => text.includes(w));
}

/** Dietary settings: dairy, diet, exclusions and (optionally) "avoid had in the last seven days". */
export function suitsPreferences(recipe, prefs = {}, cooked = {}, now = Date.now()) {
  if (prefs.dairy && recipe.dairy) return false;
  if (prefs.diet === "Vegetarian" && recipe.diet && !["Vegetarian", "Vegan"].includes(recipe.diet))
    return false;
  if (prefs.diet === "Vegan" && recipe.diet && recipe.diet !== "Vegan") return false;
  if (prefs.avoid && cooked[recipe.id] && now - new Date(cooked[recipe.id]).getTime() <= 7 * DAY)
    return false;
  return !excludedBy(recipe, prefs.exclude);
}

export const daysSince = (iso, now = Date.now()) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null;

export const isQuick = (m) =>
  m.effort === "Hardly any" ||
  m.effort === "Easy" ||
  (m.minutes > 0 && m.minutes <= 30) ||
  ["Freezer", "No cooking", "Takeaway"].includes(m.sort);
export const isLazy = (m) =>
  m.effort === "Hardly any" || ["Freezer", "No cooking", "Takeaway"].includes(m.sort);
const unknownEffort = (m) => !m.effort && !m.sort && !(m.minutes > 0);

/**
 * Suggestions for tonight, best first. Regular meals are the default source; "something different"
 * leans on the to-try list and meals not had for a while. Meals with no effort saved are offered
 * after the known matches, flagged so the app can ask once and remember.
 */
export function suggestMeals(meals, opts = {}) {
  const { mood = "any", have = "", prefs = {}, cooked = {}, now = Date.now(), random = Math.random } = opts;
  const own = meals.filter((m) => !m.sample);
  let pool = (own.length ? own : meals).filter((m) =>
    suitsPreferences(m, { ...prefs, avoid: false }, cooked, now),
  );
  const recent = (m) => prefs.avoid && cooked[m.id] && now - new Date(cooked[m.id]).getTime() <= 7 * DAY;
  if (pool.some((m) => !recent(m))) pool = pool.filter((m) => !recent(m));
  const since = (m) => daysSince(cooked[m.id], now) ?? 90;
  const weight = (m) => Math.min(since(m), 60) + 5 + (m.favourite ? 25 : 0);
  // Weighted shuffle: meals not had for a while, and favourites, tend to come first.
  const shuffle = (list) =>
    list
      .map((m) => ({ m, k: -Math.log(Math.max(random(), 1e-9)) / weight(m) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.m);
  const tag = (list, why, unknown = false) => list.map((meal) => ({ meal, why, unknown }));
  const regular = pool.filter((m) => m.list !== "try");
  const toTry = pool.filter((m) => m.list === "try");

  if (mood === "quick")
    return [
      ...tag(shuffle(regular.filter(isQuick)), "quick"),
      ...tag(shuffle(regular.filter(unknownEffort)), "quick", true),
    ];
  if (mood === "lazy")
    return [
      ...tag(shuffle(regular.filter(isLazy)), "lazy"),
      ...tag(shuffle(regular.filter(unknownEffort)), "lazy", true),
    ];
  if (mood === "have") {
    const words = exclusionList(have);
    const stem = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
    const scored = pool
      .map((m) => {
        const text = [m.title, ...parseIngredientLines(m.ingredients).map((l) => l.name)]
          .join(" ")
          .toLowerCase();
        const used = words.filter((w) => text.includes(w) || text.includes(stem(w)));
        return { m, used };
      })
      .filter((x) => x.used.length);
    const order = new Map(shuffle(scored.map((x) => x.m)).map((m, i) => [m.id, i]));
    scored.sort((a, b) => b.used.length - a.used.length || order.get(a.m.id) - order.get(b.m.id));
    return scored.map((x) => ({ meal: x.m, why: "have", used: x.used, unknown: false }));
  }
  if (mood === "different") {
    const longest = [...regular].sort(
      (a, b) => since(b) - since(a) || (b.favourite ? 1 : 0) - (a.favourite ? 1 : 0),
    );
    return [
      ...tag(shuffle(toTry), "try"),
      ...tag(longest.slice(0, Math.max(3, Math.ceil(longest.length / 3))), "while"),
    ];
  }
  return tag(shuffle(regular.length ? regular : pool), "any");
}

// ---------- Sophia's Little World ----------

export const SAID = "Something she said";
export const MEMORY_TYPES = [SAID, "Funny moment", "A first", "Day out", "Occasion", "Moment"];
export const LONG_TYPES = ["Story", "Letter"];
const LEGACY_TYPES = {
  "Little moment": "Moment",
  Milestone: "A first",
  "First word": "A first",
  "Special occasion": "Occasion",
};

export function normaliseMemory(m) {
  const type = LEGACY_TYPES[m.type] || m.type || "Moment";
  return type === m.type ? m : { ...m, type };
}

/** A title made from the memory itself, so nobody has to write headings. */
export function memoryAutoTitle(m, dateText = "") {
  const words = m.type === SAID ? m.quote : m.story;
  if (String(words ?? "").trim()) return shortText(words, 60);
  return dateText ? `Photo, ${dateText}` : "Photo";
}

function monthsBetween(dob, date) {
  const [y1, m1, d1] = dob.split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Age on a given date, in the way parents usually count it. */
export function ageLabel(dob, date) {
  if (!DATE_RE.test(dob || "") || !DATE_RE.test(date || "")) return "";
  if (date < dob) return "Before she was born";
  const [y1, m1, d1] = dob.split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
  const months = monthsBetween(dob, date);
  if (days === 0) return "The day she was born";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} old`;
  if (months < 2) return `${Math.floor(days / 7)} weeks old`;
  if (months < 24) return `${months} months old`;
  const y = Math.floor(months / 12),
    m = months % 12;
  return m ? `${y} years, ${m} month${m === 1 ? "" : "s"} old` : `${y} years old`;
}

const NUMBER_WORDS = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];
/** Groups for the By age view: "Her first year", "One year old", "Two years old"… */
export function ageGroup(dob, date) {
  if (!DATE_RE.test(dob || "") || !DATE_RE.test(date || "")) return "";
  if (date < dob) return "Before she was born";
  const years = Math.floor(monthsBetween(dob, date) / 12);
  if (years === 0) return "Her first year";
  const word = NUMBER_WORDS[years] || String(years);
  return `${word} year${years === 1 ? "" : "s"} old`;
}

export const CHAPTERS = ["The first year", "One to two", "Two and beyond"];

/** Chapter names used by the first versions; still offered when no date of birth is saved. */
export function chapterFor(dob, date) {
  if (!DATE_RE.test(dob || "") || !DATE_RE.test(date || "") || date < dob) return "";
  const months = monthsBetween(dob, date);
  return months < 12 ? CHAPTERS[0] : months < 24 ? CHAPTERS[1] : CHAPTERS[2];
}

// ---------- The Little Wishlist ----------

export const WISH_KINDS = {
  Product: "A thing",
  Restaurant: "Somewhere to eat",
  Destination: "Somewhere to go",
  Experience: "Something to do",
  "Gift idea": "Gift idea",
};
export const kindLabel = (k) => WISH_KINDS[k] || "Idea";

/** Picks something saved a while ago that hasn't been looked at recently. */
export function rediscoverPick(items, { now = Date.now(), random = Math.random, exclude = "" } = {}) {
  const own = items.filter((i) => !i.sample);
  const open = (own.length ? own : items).filter((i) => !i.done && i.id !== exclude);
  if (!open.length) return null;
  const seen = (i) => i.revisited || i.date || "";
  const sorted = [...open].sort((a, b) => seen(a).localeCompare(seen(b)));
  const older = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  return older[Math.floor(random() * older.length)];
}

// ---------- Search ----------

const SEARCH_FIELDS = {
  tea: ["title", "ingredients", "method", "effort", "sort", "diet"],
  world: ["title", "quote", "story", "type", "author", "date"],
  wish: ["title", "collection", "notes", "where", "link", "doneNote"],
};

/** Searches the words people wrote — never photo data, ids or internal flags. */
export function matchesQuery(app, item, query, extra = "") {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const fields = SEARCH_FIELDS[app] || ["title"];
  const text = fields.map((f) => item[f] ?? "").join("\n") + "\n" + extra;
  return text.toLowerCase().includes(q);
}

// ---------- Backups ----------

const isPlainObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const optionalText = (i, fields) =>
  fields.every((f) => i[f] === undefined || i[f] === null || typeof i[f] === "string");

/** Validates a JSON backup for one app. Throws a readable error; returns the data on success. */
export function validateBackup(p, app) {
  if (
    p?.format !== "chloe-app-backup" ||
    p.version !== 1 ||
    p.app !== app ||
    !p.data ||
    !Array.isArray(p.data.items) ||
    p.data.items.length > 10000
  )
    throw Error("This is not a compatible backup for this app.");
  const ids = new Set();
  for (const i of p.data.items) {
    if (
      !isPlainObject(i) ||
      typeof i.id !== "string" ||
      !ID_RE.test(i.id) ||
      ids.has(i.id) ||
      typeof i.title !== "string" ||
      !i.title.trim()
    )
      throw Error("The backup has invalid entries.");
    ids.add(i.id);
    if (i.image && (typeof i.image !== "string" || !(INLINE_RE.test(i.image) || ASSET_RE.test(i.image))))
      throw Error("The backup contains an unsupported image.");
    if (app === "tea") {
      if (!optionalText(i, ["ingredients", "method", "effort", "cuisine", "mood", "sort", "list", "diet"]))
        throw Error("The backup is missing required fields.");
      if (
        i.minutes !== undefined &&
        i.minutes !== null &&
        i.minutes !== "" &&
        (!Number.isFinite(i.minutes) || i.minutes < 1)
      )
        throw Error("Invalid recipe duration.");
    }
    if (app === "world") {
      if (typeof i.date !== "string" || !optionalText(i, ["type", "chapter", "story", "quote", "author"]))
        throw Error("The backup is missing required fields.");
      if (!DATE_RE.test(i.date)) throw Error("Invalid memory date.");
    }
    if (app === "wish") {
      if (!optionalText(i, ["collection", "kind", "notes", "where", "doneNote", "doneDate"]))
        throw Error("The backup is missing required fields.");
      if (i.price !== undefined && i.price !== null && i.price !== "" && !Number.isFinite(Number(i.price)))
        throw Error("Invalid price in the backup.");
    }
    if (i.link && !safeUrl(i.link)) throw Error("Invalid saved link.");
    if (i.updated !== undefined && typeof i.updated !== "string")
      throw Error("The backup has invalid entries.");
  }
  if (p.data.deleted !== undefined) {
    if (!isPlainObject(p.data.deleted)) throw Error("The backup has invalid entries.");
    for (const [id, when] of Object.entries(p.data.deleted))
      if (!ID_RE.test(id) || typeof when !== "string") throw Error("The backup has invalid entries.");
  }
  if (app === "world" && p.data.profile !== undefined) {
    const dob = p.data.profile?.dob;
    if (!isPlainObject(p.data.profile) || (dob && !DATE_RE.test(dob))) throw Error("Invalid date of birth.");
  }
  if (app === "tea") {
    const d = p.data;
    if (
      !isPlainObject(d.preferences) ||
      !Array.isArray(d.custom) ||
      !isPlainObject(d.plan) ||
      !isPlainObject(d.checked) ||
      !isPlainObject(d.cooked) ||
      typeof d.preferences.exclude !== "string"
    )
      throw Error("Incomplete recipe backup.");
    for (const c of d.custom)
      if (!isPlainObject(c) || typeof c.id !== "string" || !ID_RE.test(c.id) || typeof c.label !== "string")
        throw Error("Incomplete recipe backup.");
    for (const [day, id] of Object.entries(d.plan))
      if (!DATE_RE.test(day) || typeof id !== "string" || (id && !ID_RE.test(id)))
        throw Error("Incomplete recipe backup.");
    for (const [id, when] of Object.entries(d.cooked))
      if (!ID_RE.test(id) || typeof when !== "string" || Number.isNaN(new Date(when).getTime()))
        throw Error("Incomplete recipe backup.");
    for (const v of Object.values(d.checked))
      if (typeof v !== "boolean") throw Error("Incomplete recipe backup.");
  }
  return p.data;
}

/**
 * Combines a copy from another device with this one, without a server.
 * - Entries only on the other device are added.
 * - The same entry on both keeps whichever was changed most recently.
 * - Deletions travel too, so a removed entry does not come back.
 * - Example entries are never merged.
 */
export function mergeCollections(local, incoming, app) {
  const deleted = { ...(local.deleted || {}) };
  for (const [id, when] of Object.entries(incoming.deleted || {}))
    if (!deleted[id] || when > deleted[id]) deleted[id] = when;
  const byId = new Map(local.items.map((i) => [i.id, i]));
  const replacements = new Map();
  const added = [];
  for (const inc of incoming.items) {
    if (inc.sample) continue;
    if (deleted[inc.id] && deleted[inc.id] >= (inc.updated || "")) continue;
    const loc = byId.get(inc.id);
    if (!loc) added.push(inc);
    else if ((inc.updated || "") > (loc.updated || "")) replacements.set(inc.id, inc);
  }
  let removed = 0;
  const items = [];
  for (const loc of local.items) {
    if (!loc.sample && deleted[loc.id] && deleted[loc.id] >= (loc.updated || "")) {
      removed++;
      continue;
    }
    items.push(replacements.get(loc.id) || loc);
  }
  added.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  const data = { ...local, items: [...added, ...items], deleted };
  if (app === "world" && !local.profile?.dob && incoming.profile?.dob) data.profile = { ...incoming.profile };
  if (app === "tea") {
    const cooked = { ...(local.cooked || {}) };
    for (const [id, when] of Object.entries(incoming.cooked || {}))
      if (!cooked[id] || when > cooked[id]) cooked[id] = when;
    data.cooked = cooked;
  }
  return { data, added: added.length, updated: replacements.size, removed };
}

/** Which own entries have changed since the last saved copy. */
export function changesSince(items, lastExport) {
  return items.filter((i) => !i.sample && (!lastExport || (i.updated || "") > lastExport)).length;
}

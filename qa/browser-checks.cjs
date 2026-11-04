// End-to-end journeys in headless Chromium at iPhone size (390 × 844, en-GB).
//   node qa/browser-checks.cjs dist [first-version dist] [second-version dist] [screenshot dir]
// Needs Playwright and sharp. Chromium is not Safari: this covers logic, storage, layout and
// journeys, not iOS-specific behaviour such as Home Screen install, the share sheet or the Photos picker.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium, devices } = require("playwright");
const sharp = require("sharp");

const NEW = path.resolve(process.argv[2] || path.join(__dirname, "..", "dist"));
const V1 = process.argv[3] && process.argv[3] !== "-" ? path.resolve(process.argv[3]) : null;
const V2 = process.argv[4] && process.argv[4] !== "-" ? path.resolve(process.argv[4]) : null;
const SHOTS = process.argv[5] ? path.resolve(process.argv[5]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
let root = NEW;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, {
    "content-type": types[path.extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});

const passed = [];
const ok = (name) => {
  passed.push(name);
  console.log("  ✓ " + name);
};
const photoBuffer = (w, h, colour) =>
  sharp({ create: { width: w, height: h, channels: 3, background: colour } })
    .jpeg({ quality: 90 })
    .toBuffer();

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    deviceScaleFactor: 1,
    locale: "en-GB",
    timezoneId: "Europe/London",
    acceptDownloads: true,
    serviceWorkers: "block",
    ...opts,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.errors = errors;
  return { ctx, page };
}
const readApp = (page, key) =>
  page.evaluate(
    (key) =>
      new Promise((resolve) => {
        const r = indexedDB.open("chloe-collection");
        r.onsuccess = () => {
          const q = r.result.transaction("apps").objectStore("apps").get(key);
          q.onsuccess = () => {
            resolve(q.result);
            r.result.close();
          };
        };
      }),
    key,
  );
const photoKeys = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("chloe-collection");
        r.onsuccess = () => {
          if (!r.result.objectStoreNames.contains("photos")) return resolve(null);
          const q = r.result.transaction("photos").objectStore("photos").getAllKeys();
          q.onsuccess = () => {
            resolve(q.result);
            r.result.close();
          };
        };
      }),
  );
const shot = async (page, name, full = true) => {
  if (!SHOTS) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: full });
};
const settle = (page, ms = 200) => page.waitForTimeout(ms);
const closed = (page) => page.waitForSelector("#modal:not([open])", { state: "attached" });
const tapPill = (page, value) => page.click(`#modal label:has(> input[value="${value}"]) > span`);
const open = async (page, hash) => {
  await page.goto(`${page.base}/?r=${Math.random()}#${hash}`);
  await page.waitForSelector(hash ? ".nav" : ".gift");
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const blue = await photoBuffer(2400, 1800, { r: 90, g: 140, b: 170 });
  const pink = await photoBuffer(1200, 1600, { r: 220, g: 170, b: 180 });

  // ---------- 1. Upgrades keep people's own entries ----------
  if (V1) {
    console.log("Upgrade from the first version");
    root = V1;
    const { ctx, page } = await newPage(browser);
    page.base = base;
    await page.goto(base + "/#world");
    await page.waitForSelector(".nav");
    await page.click('[data-action="add"]');
    await page.fill('#edit-form [name="title"]', "Old version memory");
    await page.fill('#edit-form [name="story"]', "Written before the upgrade");
    await page.setInputFiles('#edit-form [name="photo"]', {
      name: "a.jpg",
      mimeType: "image/jpeg",
      buffer: blue,
    });
    await page.click("#edit-form button.primary");
    await closed(page);
    await page.goto(base + "/#wish");
    await page.waitForSelector(".nav");
    await page.click('[data-action="favourite"][data-id="w2"]');
    await page.goto(base + "/#tea");
    await page.waitForSelector(".nav");
    await page.click('[data-tab="recipes"]');
    await page.click('[data-action="add"]');
    await page.fill('#edit-form [name="title"]', "Nan’s stew");
    await page.fill('#edit-form [name="ingredients"]', "500 g | beef\n2 | carrots");
    await page.fill('#edit-form [name="method"]', "Slow cook.");
    await page.click("#edit-form button.primary");
    await closed(page);
    const before = {
      world: await readApp(page, "world"),
      tea: await readApp(page, "tea"),
      wish: await readApp(page, "wish"),
    };
    root = NEW;
    await page.goto(base + "/?upgraded#world");
    await page.waitForSelector(".nav");
    await settle(page, 400);
    const world = await readApp(page, "world");
    const tea = await readApp(page, "tea");
    const mem = world.items.find((i) => i.title === "Old version memory");
    assert.ok(mem && /^idb:/.test(mem.image), "own memory kept, photo moved");
    assert.equal(mem.story, "Written before the upgrade");
    assert.ok(
      !world.items.some((i) => ["m1", "m2", "m3", "m4"].includes(i.id)),
      "old essay-style examples replaced",
    );
    const stew = tea.items.find((i) => i.title === "Nan’s stew");
    assert.equal(stew.ingredients, "500 g | beef\n2 | carrots");
    assert.ok(!tea.items.some((i) => i.sample), "old cookbook examples removed");
    assert.equal((await readApp(page, "wish")).items.find((i) => i.id === "w2").favourite, true);
    assert.ok(
      await page.locator(".memory h3", { hasText: "Old version memory" }).count(),
      "old memory shows with its own title",
    );
    await page.click('[data-tab="timeline"]');
    await open(page, "tea");
    await page.click('[data-tab="meals"]');
    assert.ok(await page.locator(".meal-row", { hasText: "Nan’s stew" }).count());
    ok("first-version data upgrades: own memory, photo, recipe and favourite kept; old examples swapped out");
    void before;
    await ctx.close();
  }
  if (V2) {
    console.log("Upgrade from the second version");
    root = V2;
    const { ctx, page } = await newPage(browser);
    page.base = base;
    await page.goto(base + "/#world");
    await page.waitForSelector(".nav");
    await page.click('[data-tab="settings"]');
    await page.fill('#profile-form [name="dob"]', "2025-08-15");
    await page.click("#profile-form button.secondary");
    await settle(page);
    await page.click('[data-tab="timeline"]');
    await page.click('[data-action="add"]');
    await page.fill('#edit-form [name="title"]', "First word");
    await page.selectOption('#edit-form [name="type"]', "First word");
    await page.fill('#edit-form [name="story"]', "Said ‘duck’ at the park.");
    await page.click("#edit-form button.primary");
    await closed(page);
    await page.goto(base + "/#wish");
    await page.waitForSelector(".nav");
    await page.click('[data-open="w2"]');
    await page.click('[data-action="complete"]');
    await page.goto(base + "/#tea");
    await page.waitForSelector(".nav");
    await page.click('[data-tab="week"]');
    await page.locator("[data-plan]").first().selectOption("r2");
    await settle(page);
    root = NEW;
    await page.goto(base + "/?upgraded#world");
    await page.waitForSelector(".nav");
    await settle(page, 400);
    const world = await readApp(page, "world");
    assert.equal(world.profile.dob, "2025-08-15");
    const first = world.items.find((i) => i.title === "First word");
    assert.equal(first.story, "Said ‘duck’ at the park.");
    assert.ok(
      await page
        .locator(".memory", { hasText: "Said ‘duck’ at the park." })
        .locator(".memory-foot", { hasText: "A first" })
        .count(),
      "old type shows under its new name",
    );
    const wish = await readApp(page, "wish");
    assert.equal(wish.items.find((i) => i.id === "w2").done, true);
    const tea = await readApp(page, "tea");
    assert.ok(
      tea.items.some((i) => i.id === "r2"),
      "an example that was planned is kept",
    );
    assert.equal(Object.values(tea.plan)[0], "r2");
    ok("second-version data upgrades: date of birth, memory, enjoyed wish and planned meal kept");
    await ctx.close();
  }

  // ---------- 2. What's for Tea? ----------
  console.log("What’s for Tea?");
  {
    const { ctx, page } = await newPage(browser);
    page.base = base;
    await open(page, "tea");
    assert.match(await page.textContent("main"), /What do you usually have for tea\?/);
    await shot(page, "tea-start");
    // Teach it the usual teas: one tap to open, a few taps, two typed, one tap to add.
    await page.click('[data-action="quick-pick"]');
    for (const name of [
      "Spag bol",
      "Chicken wraps",
      "Jacket potatoes",
      "Pizza",
      "Fish fingers, chips and peas",
      "Stir fry",
    ])
      await page.click(`#quickpick-form label:has(> input[value="${name}"]) > span`);
    await page.fill('#quickpick-form [name="lines"]', "Halloumi wraps\nNan’s stew");
    await shot(page, "tea-quickpick", false);
    await page.click("#quickpick-form button.primary");
    await closed(page);
    let tea = await readApp(page, "tea");
    assert.equal(tea.items.length, 8);
    assert.ok(tea.items.every((m) => m.list === "regular" && !m.ingredients));
    ok("8 usual teas added in one sheet: 6 taps on names, 2 typed, 1 tap to add");
    await shot(page, "tea-tonight");
    // Can't be bothered: should come back with a low-effort meal first.
    await page.click('[data-action="suggest"][data-mood="lazy"]');
    const lazyName = await page.textContent(".suggest-name");
    assert.ok(["Pizza", "Fish fingers, chips and peas"].includes(lazyName), lazyName);
    await shot(page, "tea-suggest-lazy", false);
    await page.click('[data-action="another"]');
    await settle(page);
    ok(`“Can’t be bothered” suggests a freezer meal first (${lazyName})`);
    // Quick and easy eventually reaches a meal with no effort saved, and asks once.
    await page.click('[data-action="close"]');
    await page.click('[data-action="suggest"][data-mood="quick"]');
    for (let n = 0; n < 8 && !(await page.locator(".teach").count()); n++)
      await page.click('[data-action="another"]');
    const asked = await page.textContent(".suggest-name");
    assert.ok(["Halloumi wraps", "Nan’s stew"].includes(asked), asked);
    await page.click('.teach [data-effort="Easy"]');
    await settle(page);
    tea = await readApp(page, "tea");
    assert.equal(tea.items.find((m) => m.title === asked).effort, "Easy");
    ok(`a meal saved by name only is offered, and one tap teaches it (“${asked}” saved as easy)`);
    await page.click('[data-action="close"]');
    // Use what we've got.
    await page.click('[data-action="suggest"][data-mood="have"]');
    await page.fill('#have-form [name="have"]', "chicken");
    await page.click("#have-form button.primary");
    assert.equal(await page.textContent(".suggest-name"), "Chicken wraps");
    ok("“Use what we’ve got” matches meal names (chicken → Chicken wraps)");
    await page.click('[data-action="tonight"]');
    await closed(page);
    assert.match(await page.textContent(".tonight-card"), /Chicken wraps/);
    await shot(page, "tea-tonight-planned");
    ok("“Have it tonight” puts it on Tonight");
    // Our meals: quick add keeps the keyboard where it is; to-try stays separate.
    await page.click('[data-tab="meals"]');
    await page.fill("#meal-quick input", "Fish pie");
    await page.press("#meal-quick input", "Enter");
    await settle(page);
    assert.equal(await page.evaluate(() => document.activeElement?.closest("#meal-quick") !== null), true);
    await page.fill("#meal-quick input", "Fish pie");
    await page.press("#meal-quick input", "Enter");
    await settle(page);
    assert.match(await page.textContent("#toast"), /Already on your list/);
    await page.click('.chips [data-value="To try"]');
    await page.fill("#meal-quick input", "Laksa");
    await page.press("#meal-quick input", "Enter");
    await settle(page);
    tea = await readApp(page, "tea");
    assert.equal(tea.items.find((m) => m.title === "Laksa").list, "try");
    assert.equal(tea.items.filter((m) => m.title === "Fish pie").length, 1);
    await page.click('.chips [data-value="Regulars"]');
    await shot(page, "tea-meals");
    ok("adding by name keeps focus in the box, spots duplicates and keeps to-try separate");
    // Something different leads with the to-try list.
    await page.click('[data-tab="choose"]');
    await page.click('[data-action="unplan-tonight"]');
    await page.click('[data-action="suggest"][data-mood="different"]');
    assert.equal(await page.textContent(".suggest-name"), "Laksa");
    await page.click('[data-action="close"]');
    ok("“Something different” starts with the to-try list");
    // Week and shopping: meals without shopping items are called out, not silently missed.
    await page.click('[data-tab="week"]');
    await page.click('[data-action="fill-week"]');
    await settle(page);
    tea = await readApp(page, "tea");
    assert.equal(Object.keys(tea.plan).length, 7);
    assert.equal(new Set(Object.values(tea.plan)).size, 7, "no meal twice in a week");
    assert.ok(await page.locator(".no-shop").count());
    await shot(page, "tea-week");
    await page.click('[data-tab="list"]');
    assert.match(await page.textContent(".notice.gaps"), /Not on the list yet/);
    await shot(page, "tea-shopping-gaps");
    const firstGap = page.locator('.notice.gaps [data-action="edit"]').first();
    const gapMeal = await page.locator(".notice.gaps li span").first().textContent();
    await firstGap.click();
    assert.equal(await page.evaluate(() => document.activeElement?.name), "ingredients");
    await page.fill('#edit-form [name="ingredients"]', "500 g | mince\nspaghetti");
    await page.click("#edit-form button.primary");
    await closed(page);
    assert.ok(
      !(await page.textContent(".notice.gaps")).includes(gapMeal.split(" · ")[1]),
      "that meal is no longer listed as missing",
    );
    assert.ok(await page.locator(".shopping label", { hasText: "500 g mince" }).count());
    await page.locator('[data-check="mince|g"]').check();
    await settle(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.click('[data-action="copy-list"]');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /Still to add things for:/);
    assert.ok(!copied.includes("500 g mince"), "ticked items aren’t copied");
    ok(
      "shopping lists meals with no items, adding items fills the list, and the copied list says what’s missing",
    );
    // Delete a planned meal with no shopping items: the detail says so, and the plan forgets it.
    await page.click('[data-tab="meals"]');
    tea = await readApp(page, "tea");
    const bare = tea.items.find((m) => !m.ingredients && Object.values(tea.plan).includes(m.id));
    await page.click(`.meal-open[data-open="${bare.id}"]`);
    assert.match(await page.textContent("#modal"), /No shopping items saved/);
    await page.click('#modal [data-action="delete"]');
    await page.click('[data-action="delete-confirmed"]');
    await closed(page);
    tea = await readApp(page, "tea");
    assert.ok(!Object.values(tea.plan).includes(bare.id));
    assert.ok(!tea.items.some((m) => m.id === bare.id));
    ok("deleting a meal asks first and removes it from the week");
    // Settings: exclusions apply to suggestions.
    await page.click('[data-tab="settings"]');
    await page.fill('#prefs-form [name="exclude"]', "chicken");
    await page.click("#prefs-form button.primary");
    await settle(page);
    await page.click('[data-tab="choose"]');
    if (await page.locator('[data-action="unplan-tonight"]').count())
      await page.click('[data-action="unplan-tonight"]');
    for (let n = 0; n < 6; n++) {
      await page.click('[data-action="suggest"][data-mood="any"]');
      assert.ok(!/chicken/i.test(await page.textContent(".suggest-name")));
      await page.click('[data-action="close"]');
    }
    ok("excluded ingredients never come up");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }

  // ---------- 3. Sophia's Little World ----------
  console.log("Sophia’s Little World");
  {
    const { ctx, page } = await newPage(browser);
    page.base = base;
    await open(page, "world");
    assert.ok(await page.locator(".examples-note").count(), "examples are labelled");
    await shot(page, "world-examples");
    // Record something she said: tap, type, tap.
    await page.click('[data-action="add"][data-type="Something she said"]');
    assert.equal(
      await page.evaluate(() => document.activeElement?.name),
      "quote",
      "cursor is already in “What did she say?”",
    );
    assert.equal(await page.locator('#edit-form [name="title"]').isVisible(), false, "no title needed");
    await shot(page, "world-said-editor", false);
    await page.keyboard.type("Daddy, your hair is going to sleep.");
    await page.click("#edit-form button.primary");
    await closed(page);
    let world = await readApp(page, "world");
    const said = world.items.find((m) => m.quote === "Daddy, your hair is going to sleep.");
    assert.ok(
      said &&
        said.autoTitle &&
        said.date === (await page.evaluate(() => new Date().toLocaleDateString("en-CA"))),
    );
    assert.equal(
      await page.locator(".examples-note").count(),
      0,
      "examples step aside once there’s a real memory",
    );
    assert.equal(await page.locator(".memory").count(), 1);
    assert.equal(await page.locator(".memory h3").count(), 0, "no made-up heading on the card");
    ok("“She said…”: one tap, type her words, one tap to save; dated today, no title, examples hidden");
    // Something happened, yesterday, with a photo.
    await page.click('[data-action="add"][data-type="Moment"]');
    assert.equal(await page.evaluate(() => document.activeElement?.name), "story");
    await page.keyboard.type("Fed her toast to the radiator.");
    await tapPill(page, "Funny moment");
    await page.click('#modal [data-action="set-date"]:has-text("Yesterday")');
    await page.setInputFiles('#edit-form [name="photo"]', {
      name: "p.jpg",
      mimeType: "image/jpeg",
      buffer: blue,
    });
    await page.click("#edit-form button.primary");
    await closed(page);
    world = await readApp(page, "world");
    const funny = world.items.find((m) => m.story === "Fed her toast to the radiator.");
    assert.equal(funny.type, "Funny moment");
    assert.ok(/^idb:/.test(funny.image));
    const y = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toLocaleDateString("en-CA");
    });
    assert.equal(funny.date, y);
    await settle(page, 300);
    await shot(page, "world-timeline");
    ok("“Something happened”: words, kind, ‘Yesterday’ and a photo");
    // Validation.
    await page.click('[data-action="add"][data-type="Something she said"]');
    await page.click("#edit-form button.primary");
    assert.match(await page.textContent("#form-error"), /Add what she said/);
    await tapPill(page, "Moment");
    assert.equal(await page.locator("#quote-field").isVisible(), false);
    await page.click("#edit-form button.primary");
    assert.match(await page.textContent("#form-error"), /a few words or a photo/);
    await page.click('[data-action="close"]');
    await page.click('[data-action="close"]');
    ok("empty memories are refused with a plain message; switching kind changes the question");
    // A longer letter with a title.
    await page.click('[data-action="add"][data-type="Moment"]');
    await tapPill(page, "Letter");
    assert.equal(await page.locator("details.more").evaluate((d) => d.open), true);
    await page.fill('#edit-form [name="story"]', "Dear Sophia, today you learned to jump.");
    await page.fill('#edit-form [name="title"]', "On your second birthday");
    await page.selectOption('#edit-form [name="author"]', "John");
    await page.click("#edit-form button.primary");
    await closed(page);
    await page.click('.chips [data-value="Stories & letters"]');
    assert.equal(await page.locator(".memory").count(), 1);
    assert.equal(await page.textContent(".memory h3"), "On your second birthday");
    ok("letters still work, with a title, and live under “Stories & letters”");
    // Search and filters.
    await page.click('.chips [data-value="All"]');
    // Search appears once there are more than three memories.
    await page.click('[data-action="add"][data-type="Moment"]');
    await page.keyboard.type("Sang to the washing machine.");
    await page.click("#edit-form button.primary");
    await closed(page);
    await page.fill("#search", "radiator");
    assert.equal(await page.locator("#results .memory").count(), 1);
    await page.fill("#search", "");
    await page.click('.chips [data-value="She said"]');
    assert.equal(await page.locator("#results .memory").count(), 1);
    ok("search finds her words; filters narrow by kind");
    // The She said page and the viewer.
    await page.click('[data-tab="said"]');
    assert.match(await page.textContent(".said-list"), /your hair is going to sleep/);
    await shot(page, "world-said");
    await page.click(".said-card");
    assert.match(await page.textContent("#dialog-title"), /\d{4}$/);
    await page.click('[data-action="step"]:has-text("Older")');
    assert.match(await page.textContent("#modal"), /radiator|washing machine|second birthday/);
    await shot(page, "world-viewer", false);
    await page.click('[data-action="close"]');
    ok("“She said” collects her words; the viewer leads with the date and steps through memories");
    // Date of birth: ages and By age.
    await page.click('[data-tab="ages"]');
    assert.ok(await page.locator(".notice", { hasText: "date of birth" }).count());
    await page.click('.notice [data-tab="settings"]');
    await page.fill('#profile-form [name="dob"]', "2024-11-20");
    await page.click("#profile-form button.secondary");
    await settle(page);
    await page.click('[data-tab="ages"]');
    assert.match(await page.textContent(".group-title"), /One year old/);
    assert.match(await page.textContent(".memory-meta"), /months old/);
    await shot(page, "world-ages");
    ok("with a date of birth, every memory shows her age and By age groups them");
    // On this day.
    await page.click('[data-tab="timeline"]');
    await page.click('[data-action="add"][data-type="Moment"]');
    await page.keyboard.type("First Bonfire Night, hated the bangs.");
    const lastYear = await page.evaluate(() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return d.toLocaleDateString("en-CA");
    });
    await page.fill('#edit-form [name="date"]', lastYear);
    await page.click("#edit-form button.primary");
    await closed(page);
    assert.ok(await page.locator(".otd").count());
    await page.click(".otd");
    assert.match(await page.textContent("#modal"), /Bonfire/);
    await page.click('[data-action="close"]');
    ok("“On this day” appears only when there’s something from this date");
    // Delete asks first.
    await page.click(`[data-open="${said.id}"]`);
    await page.click('#modal [data-action="delete"]');
    assert.match(await page.textContent("#modal"), /can’t be undone/);
    await page.click('[data-action="close"]');
    world = await readApp(page, "world");
    assert.ok(world.items.some((m) => m.id === said.id));
    ok("deleting asks first, and backing out keeps the memory");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }

  // ---------- 4. The Little Wishlist ----------
  console.log("The Little Wishlist");
  {
    const { ctx, page } = await newPage(browser);
    page.base = base;
    await open(page, "wish");
    await shot(page, "wish-examples");
    // Just a link.
    await page.click('[data-action="add"]');
    await shot(page, "wish-editor", false);
    await page.fill('#edit-form [name="link"]', "etsy.com/listing/12345/speckled-mug");
    await page.click("#edit-form button.primary");
    await closed(page);
    let wish = await readApp(page, "wish");
    const linkOnly = wish.items.find((i) => i.link === "https://etsy.com/listing/12345/speckled-mug");
    assert.ok(linkOnly && linkOnly.title === "From etsy.com" && linkOnly.date);
    assert.ok(await page.locator(".wish-tile .tile-host", { hasText: "etsy.com" }).count());
    ok("a link on its own is enough to save something (tidied to https, named after the site)");
    // Just a photo.
    await page.click('[data-action="add"]');
    await page.setInputFiles('#edit-form [name="photo"]', {
      name: "w.jpg",
      mimeType: "image/jpeg",
      buffer: pink,
    });
    await page.click("#edit-form button.primary");
    await closed(page);
    wish = await readApp(page, "wish");
    assert.ok(wish.items.some((i) => i.title === "Saved photo" && /^idb:/.test(i.image)));
    ok("a photo on its own is enough too");
    // Nothing, or a bad link, is refused.
    await page.click('[data-action="add"]');
    await page.click("#edit-form button.primary");
    assert.match(await page.textContent("#form-error"), /link, a photo or a few words/);
    await page.fill('#edit-form [name="link"]', "not a link");
    await page.click("#edit-form button.primary");
    assert.match(await page.textContent("#form-error"), /link doesn’t look right/);
    // A restaurant to try together, with where and why.
    await page.fill('#edit-form [name="link"]', "");
    await page.fill('#edit-form [name="title"]', "Little Italian place on Bold Street");
    await page.fill('#edit-form [name="notes"]', "Friends said the pasta is amazing.");
    await tapPill(page, "Restaurant");
    await page.click("#modal details.more summary");
    await page.fill('#edit-form [name="where"]', "Bold Street");
    await page.fill('#edit-form [name="collection"]', "Date nights");
    await page.check('#edit-form [name="together"]');
    await page.check('#edit-form [name="priority"]');
    await page.click("#edit-form button.primary");
    await closed(page);
    assert.ok(
      await page.locator(".top-strip .mini", { hasText: "Little Italian place" }).count(),
      "top wishes strip",
    );
    const card = page.locator(".wish-card", { hasText: "Little Italian place" });
    assert.match(await card.textContent(), /Friends said the pasta is amazing/);
    assert.match(await card.locator(".wish-tile").textContent(), /Somewhere to eat/);
    assert.match(await card.locator("small").textContent(), /Bold Street/);
    ok("cards show why it was saved, what it is and where; top wishes sit at the top");
    await page.click('.chips [data-value="Together"]');
    assert.ok(await page.locator("#results .wish-card", { hasText: "Little Italian" }).count());
    await page.click('.chips [data-value="Places to eat"]');
    assert.ok(await page.locator("#results .wish-card", { hasText: "Little Italian" }).count());
    await page.click('.chips [data-value="All"]');
    // Search appears once there are more than three wishes.
    await page.click('[data-action="add"]');
    await page.fill('#edit-form [name="title"]', "A good bread knife");
    await page.click("#edit-form button.primary");
    await closed(page);
    await page.fill("#search", "pasta is amazing");
    assert.equal(await page.locator("#results .wish-card").count(), 1);
    await page.fill("#search", "etsy");
    assert.equal(await page.locator("#results .wish-card").count(), 1);
    await page.fill("#search", "");
    await shot(page, "wish-gallery");
    ok("filters for together and places to eat; search covers notes and the link’s site");
    // Collections: open, rename, remove (wishes stay).
    await page.click('[data-tab="collections"]');
    await shot(page, "wish-collections");
    await page.click('.collection[data-value="Date nights"]');
    await page.click('[data-action="rename-coll"]');
    await page.fill('#rename-form [name="name"]', "Evenings out");
    await page.click("#rename-form button.primary");
    await closed(page);
    assert.match(await page.textContent(".coll-head h1"), /Evenings out/);
    await page.click('[data-action="remove-coll"]');
    await page.click('[data-action="remove-coll-confirmed"]');
    await closed(page);
    wish = await readApp(page, "wish");
    const restaurant = wish.items.find((i) => i.title.startsWith("Little Italian"));
    assert.equal(restaurant.collection, "");
    assert.ok(await page.locator('.collection[data-value="__none"]').count());
    ok("collections can be renamed or removed without losing the wishes in them");
    // We did it, with a note; then it's in Enjoyed with the date.
    await page.click('[data-tab="gallery"]');
    await page.click(`.wish-card [data-open="${restaurant.id}"]`);
    await page.click('#modal [data-action="mark-done"]');
    assert.match(await page.textContent("#dialog-title"), /We did it/);
    await page.fill('#done-form [name="doneNote"]', "Went for Chloe’s birthday. Tiramisu!");
    await page.click("#done-form button.primary");
    await closed(page);
    await page.click('[data-tab="done"]');
    assert.match(await page.textContent("#results"), /Did it \d/);
    assert.match(await page.textContent("#results"), /Tiramisu/);
    await shot(page, "wish-enjoyed");
    await page.click(`[data-open="${restaurant.id}"]`);
    await page.click('[data-action="undo-done"]');
    wish = await readApp(page, "wish");
    assert.equal(wish.items.find((i) => i.id === restaurant.id).done, false);
    assert.equal(
      wish.items.find((i) => i.id === restaurant.id).doneNote,
      "Went for Chloe’s birthday. Tiramisu!",
    );
    await page.click('[data-action="close"]');
    ok("“We did it” keeps the date and a note in Enjoyed; moving it back keeps the note");
    // Rediscovering something older.
    await page.click('[data-tab="gallery"]');
    await page.click('[data-action="rediscover"]');
    assert.match(await page.textContent("#modal"), /Saved .*ago|Saved today/);
    const first = await page.textContent("div.rediscover h3");
    await page.click('#modal [data-action="still-want"]');
    await settle(page);
    const second = await page.textContent("div.rediscover h3");
    assert.notEqual(first, second);
    await shot(page, "wish-rediscover", false);
    ok("“From a while ago” offers keep / got it / not any more, then shows another");
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }

  // ---------- 5. Every visible control does something ----------
  console.log("Controls");
  {
    const { ctx, page } = await newPage(browser);
    page.base = base;
    const skip = ["export", "persist", "clear-samples", "copy-list"];
    const screens = {
      tea: ["choose", "meals", "week", "list", "settings"],
      world: ["timeline", "said", "ages", "settings"],
      wish: ["gallery", "collections", "done", "settings"],
    };
    // Give each app something to show first.
    await open(page, "tea");
    await page.click('[data-action="quick-pick"]');
    for (const name of ["Spag bol", "Pizza", "Curry"])
      await page.click(`#quickpick-form label:has(> input[value="${name}"]) > span`);
    await page.click("#quickpick-form button.primary");
    await closed(page);
    const dead = [];
    for (const [app, tabs] of Object.entries(screens))
      for (const tab of tabs) {
        await open(page, app);
        await page.click(`.nav [data-tab="${tab}"]`);
        const found = await (async () => {
          const out = [];
          const n = await page.locator("main [data-action], main [data-open], main [data-tab]").count();
          for (let k = 0; k < n; k++) {
            await open(page, app);
            await page.click(`.nav [data-tab="${tab}"]`);
            const el = page.locator("main [data-action], main [data-open], main [data-tab]").nth(k);
            if (!(await el.count()) || !(await el.isVisible())) continue;
            const action = (await el.getAttribute("data-action")) || "";
            if (skip.includes(action)) continue;
            // An already-selected filter is meant to stay as it is.
            if ((await el.getAttribute("aria-pressed")) === "true") continue;
            const before = await page.evaluate(() => document.querySelector("main").innerHTML);
            await page.evaluate(() => (document.querySelector("#toast").textContent = ""));
            await el.click();
            await settle(page, 150);
            const [isOpen, after, toastText] = await page.evaluate(() => [
              document.querySelector("#modal").open,
              document.querySelector("main")?.innerHTML,
              document.querySelector("#toast").textContent,
            ]);
            if (!isOpen && after === before && !toastText)
              out.push(
                `${app}/${tab}: ${action || "link"} “${((await el.textContent().catch(() => "")) || "").trim().slice(0, 28)}”`,
              );
          }
          return out;
        })();
        dead.push(...found);
      }
    assert.deepEqual(dead, [], "controls with no effect:\n" + dead.join("\n"));
    assert.deepEqual(page.errors, []);
    ok("every visible button and link on all 13 screens does something");
    await ctx.close();
  }

  // ---------- 6. Copies between two phones ----------
  console.log("Copies");
  {
    const { ctx, page } = await newPage(browser);
    page.base = base;
    await open(page, "world");
    for (const words of ["One", "Two", "Three", "Four", "Five"]) {
      await page.click('[data-action="add"][data-type="Something she said"]');
      await page.keyboard.type(`Quote number ${words}`);
      if (words === "Two")
        await page.setInputFiles('#edit-form [name="photo"]', {
          name: "p.jpg",
          mimeType: "image/jpeg",
          buffer: blue,
        });
      await page.click("#edit-form button.primary");
      await closed(page);
    }
    assert.equal(await page.locator(".notice.reminder").count(), 0, "no nagging on the day you start");
    // Pretend those memories were saved three days ago.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const r = indexedDB.open("chloe-collection");
          r.onsuccess = () => {
            const tx = r.result.transaction("apps", "readwrite");
            const store = tx.objectStore("apps");
            store.get("world").onsuccess = (e) => {
              const w = e.target.result;
              const old = new Date(Date.now() - 3 * 86400000).toISOString();
              for (const m of w.items) if (!m.sample) m.updated = old;
              store.put(w, "world");
            };
            tx.oncomplete = () => {
              r.result.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await page.waitForSelector(".nav");
    assert.equal(
      await page.locator(".notice.reminder").count(),
      1,
      "nudge once five unsaved memories are a few days old",
    );
    await page.click('.notice.reminder [data-action="export"]');
    await page.waitForSelector('[data-action="downloaded"]');
    const dl = page.waitForEvent("download");
    await page.click('[data-action="downloaded"]');
    const file = await (await dl).path();
    await page.waitForTimeout(600);
    assert.equal(await page.locator(".notice.reminder").count(), 0);
    const backup = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(backup.version, 1);
    assert.equal(backup.data.items.filter((i) => /^data:image\/jpeg/.test(i.image)).length, 1);
    ok(
      "no prompt on day one; five unsaved memories a few days old prompt a copy, which includes the photo and clears the prompt",
    );
    const { ctx: c2, page: p2 } = await newPage(browser);
    p2.base = base;
    await open(p2, "world");
    await p2.click('[data-tab="settings"]');
    await p2.click('[data-action="import"]');
    await p2.setInputFiles('#import-form [name="backup"]', file);
    await p2.click("#import-form button.primary");
    await p2.click('[data-action="merge-confirmed"]');
    await p2.waitForSelector('#dialog-title:text("Combined")');
    assert.match(await p2.textContent("#modal"), /5 added/);
    assert.equal((await photoKeys(p2)).length, 1);
    await p2.click('[data-action="close"]');
    await p2.click('[data-tab="timeline"]');
    await p2.click('[data-action="add"][data-type="Moment"]');
    await p2.keyboard.type("From the other phone");
    await p2.click("#edit-form button.primary");
    await closed(p2);
    await p2.click('[data-tab="settings"]');
    await p2.click('[data-action="export"]');
    const dl2 = p2.waitForEvent("download");
    await p2.click('[data-action="downloaded"]');
    const file2 = await (await dl2).path();
    await page.click('[data-tab="settings"]');
    await page.click('[data-action="import"]');
    await page.setInputFiles('#import-form [name="backup"]', file2);
    await page.click("#import-form button.primary");
    await page.click('[data-action="merge-confirmed"]');
    await page.waitForSelector('#dialog-title:text("Combined")');
    assert.match(await page.textContent("#modal"), /1 added, 0 updated/);
    ok("combining copies across two phones adds only what’s new");
    await page.click('[data-action="close"]');
    await page.click('[data-action="import"]');
    await page.setInputFiles('#import-form [name="backup"]', {
      name: "x.json",
      mimeType: "application/json",
      buffer: Buffer.from("not json"),
    });
    await page.click("#import-form button.primary");
    await page.waitForFunction(() => document.querySelector("#import-error")?.textContent);
    assert.match(await page.textContent("#import-error"), /isn’t a saved copy/);
    ok("a broken file is refused with a clear message");
    assert.deepEqual(page.errors, []);
    assert.deepEqual(p2.errors, []);
    await c2.close();
    await ctx.close();
  }

  // ---------- 7. Layout and offline ----------
  console.log("Layout and offline");
  {
    const { ctx, page } = await newPage(browser);
    page.base = base;
    for (const [app, tabs] of Object.entries({
      tea: ["choose", "meals", "week", "list", "settings"],
      world: ["timeline", "said", "ages", "settings"],
      wish: ["gallery", "collections", "done", "settings"],
    })) {
      await open(page, app);
      for (const t of tabs) {
        await page.click(`.nav [data-tab="${t}"]`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 0, `${app}/${t} scrolls sideways`);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll("main button, main a, main input, main select, .nav button")]
            .filter((e) => e.offsetParent && getComputedStyle(e).opacity !== "0" && e.type !== "checkbox")
            .map((e) => [
              e.textContent.trim().slice(0, 20) || e.name || e.className,
              Math.round(e.getBoundingClientRect().height),
            ])
            .filter(([, h]) => h > 0 && h < 36),
        );
        assert.deepEqual(small, [], `${app}/${t} has touch targets under 36 px`);
      }
    }
    ok("no sideways scrolling, and buttons, links and fields at least 36 px tall, on all 13 screens");
    await ctx.close();
    const off = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 });
    const p = await off.newPage();
    await p.goto(base + "/");
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload();
    await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    await p.waitForTimeout(500);
    await off.setOffline(true);
    await p.goto(base + "/#world");
    await p.waitForSelector(".nav");
    ok("reopens offline after one visit");
    await off.close();
  }

  await browser.close();
  server.close();
  console.log(`\nPASS (${passed.length} checks)`);
})().catch((e) => {
  console.error("\nFAIL:", e);
  process.exit(1);
});

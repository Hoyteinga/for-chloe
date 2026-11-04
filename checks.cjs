// Fast logic checks with no browser: node checks.cjs
// Browser checks (journeys, storage, upgrades, copies): see qa/README.md
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const L = await import(pathToFileURL(path.join(__dirname, "dist", "logic.js")).href);
  const seq = (...values) => {
    let n = 0;
    return () => values[n++ % values.length];
  };

  // ---------- Shopping ----------
  const recipes = [
    { id: "a", ingredients: "200 g | pasta\n2 tbsp | olive oil" },
    { id: "b", ingredients: "150 g | pasta\n1 tbsp | olive oil\n1 | lemon" },
    { id: "c", title: "Jacket potatoes" },
    { id: "d", title: "Takeaway", sort: "Takeaway" },
  ];
  const list = L.shoppingItems(recipes, { one: "a", two: "b" }, ["one", "two"]);
  assert.equal(list.find((i) => i.name === "pasta").qty, 350);
  assert.equal(list.find((i) => i.name === "olive oil").qty, 3);
  assert.equal(list.length, 3);
  assert.equal(list.find((i) => i.name === "pasta").key, "pasta|g");
  const gaps = L.mealsWithoutShopping(recipes, { one: "a", two: "c", three: "d" }, ["one", "two", "three"]);
  assert.deepEqual(
    gaps.map((g) => g.meal.id),
    ["c"],
    "meals with no shopping items are reported; takeaways are not",
  );

  // ---------- Meals from earlier versions ----------
  assert.equal(L.normaliseMeal({ id: "r", title: "x", effort: "A little cooking" }).effort, "Some cooking");
  assert.equal(L.normaliseMeal({ id: "r", title: "x" }).list, "regular");

  // ---------- Suggestions ----------
  const meals = [
    {
      id: "spag",
      title: "Spag bol",
      list: "regular",
      effort: "Some cooking",
      ingredients: "500 g | mince\nspaghetti",
    },
    { id: "pizza", title: "Pizza", list: "regular", effort: "Hardly any", sort: "Freezer" },
    { id: "wraps", title: "Chicken wraps", list: "regular", effort: "Easy" },
    { id: "jacket", title: "Jacket potatoes", list: "regular", effort: "" },
    { id: "laksa", title: "Laksa", list: "try", effort: "Some cooking" },
    { id: "old", title: "Example dish", sample: true },
  ];
  const now = Date.parse("2026-11-04T18:00:00Z");
  const ids = (xs) => xs.map((x) => x.meal.id);
  const any = L.suggestMeals(meals, { now, random: seq(0.5) });
  assert.ok(!ids(any).includes("laksa"), "to-try meals stay out of everyday suggestions");
  assert.ok(!ids(any).includes("old"), "examples are ignored once there are real meals");
  assert.equal(any.length, 4);
  const lazy = L.suggestMeals(meals, { mood: "lazy", now, random: seq(0.5) });
  assert.equal(lazy[0].meal.id, "pizza");
  assert.deepEqual(
    lazy.filter((s) => s.unknown).map((s) => s.meal.id),
    ["jacket"],
    "unknown effort is offered last and flagged",
  );
  const quick = L.suggestMeals(meals, { mood: "quick", now, random: seq(0.5) });
  assert.deepEqual(new Set(ids(quick.filter((s) => !s.unknown))), new Set(["pizza", "wraps"]));
  const have = L.suggestMeals(meals, { mood: "have", have: "mince, chicken", now, random: seq(0.5) });
  assert.deepEqual(new Set(ids(have)), new Set(["spag", "wraps"]));
  assert.deepEqual(
    L.suggestMeals(meals, { mood: "have", have: "chickens", now }).map((s) => s.meal.id),
    ["wraps"],
    "plurals still match",
  );
  const different = L.suggestMeals(meals, {
    mood: "different",
    now,
    random: seq(0.5),
    cooked: { spag: "2026-11-03T18:00:00Z" },
  });
  assert.equal(different[0].meal.id, "laksa", "to-try list leads “something different”");
  const avoided = L.suggestMeals(meals, {
    prefs: { avoid: true },
    cooked: { pizza: "2026-11-02T18:00:00Z" },
    now,
  });
  assert.ok(!ids(avoided).includes("pizza"), "meals had this week are skipped");
  const allRecent = Object.fromEntries(meals.map((m) => [m.id, "2026-11-03T18:00:00Z"]));
  assert.ok(
    L.suggestMeals(meals, { prefs: { avoid: true }, cooked: allRecent, now }).length,
    "if everything was recent, still suggest something",
  );
  assert.ok(!ids(L.suggestMeals(meals, { prefs: { exclude: "mince" }, now })).includes("spag"));
  const onlyExamples = L.suggestMeals([{ id: "e", title: "Example", sample: true }], { now });
  assert.equal(onlyExamples.length, 1, "examples are used only when nothing else exists");

  // ---------- Dietary settings ----------
  const pasta = {
    id: "p",
    title: "Lemon pasta",
    ingredients: "200 g | pasta\n30 g | basil",
    diet: "Vegetarian",
    dairy: false,
  };
  assert.equal(L.excludedBy(pasta, "g"), false);
  assert.equal(L.excludedBy(pasta, "basil"), true);
  assert.equal(L.suitsPreferences(pasta, { diet: "Vegan" }), false);
  assert.equal(
    L.suitsPreferences({ id: "n", title: "Chicken wraps" }, { diet: "Vegan" }),
    true,
    "meals with no type saved aren’t ruled out",
  );
  assert.equal(L.suitsPreferences({ ...pasta, dairy: true }, { dairy: true }), false);

  // ---------- Links ----------
  assert.equal(L.safeUrl("javascript:alert(1)"), "");
  assert.equal(L.tidyLink("etsy.com/listing/123"), "https://etsy.com/listing/123");
  assert.equal(L.tidyLink("javascript:alert(1)"), "");
  assert.equal(L.tidyLink("just some words"), "");
  assert.equal(L.linkHost("https://www.johnlewis.com/x"), "johnlewis.com");

  // ---------- Memories ----------
  assert.equal(L.normaliseMemory({ type: "Little moment" }).type, "Moment");
  assert.equal(L.normaliseMemory({ type: "First word" }).type, "A first");
  assert.equal(L.normaliseMemory({ type: "Special occasion" }).type, "Occasion");
  assert.equal(
    L.memoryAutoTitle({ type: L.SAID, quote: "The moon is following our car." }),
    "The moon is following our car.",
  );
  assert.equal(L.memoryAutoTitle({ type: "Moment", story: "" }, "3 November 2026"), "Photo, 3 November 2026");
  assert.equal(L.ageLabel("2025-08-15", "2025-08-15"), "The day she was born");
  assert.equal(L.ageLabel("2025-08-15", "2025-08-20"), "5 days old");
  assert.equal(L.ageLabel("2025-08-15", "2025-09-20"), "5 weeks old");
  assert.equal(L.ageLabel("2025-08-15", "2026-10-18"), "14 months old");
  assert.equal(L.ageLabel("2025-08-15", "2027-10-14"), "2 years, 1 month old");
  assert.equal(L.ageGroup("2025-08-15", "2026-08-14"), "Her first year");
  assert.equal(L.ageGroup("2025-08-15", "2026-08-15"), "One year old");
  assert.equal(L.ageGroup("2025-08-15", "2028-01-01"), "Two years old");
  assert.equal(L.chapterFor("2025-08-15", "2027-08-15"), "Two and beyond");
  assert.equal(
    L.matchesQuery("world", { quote: "Moon", story: "", type: L.SAID, date: "2026-10-21" }, "moon"),
    true,
  );
  const memory = {
    id: "m9",
    title: "Puddles",
    story: "Splashing",
    type: "Funny moment",
    date: "2026-10-01",
    image: "data:image/jpeg;base64,QWJjZGVm",
  };
  assert.equal(L.matchesQuery("world", memory, "base64"), false, "search never looks at photo data");

  // ---------- Wishes ----------
  const wishes = [
    { id: "a", title: "A", date: "2026-01-01" },
    { id: "b", title: "B", date: "2026-02-01" },
    { id: "c", title: "C", date: "2026-10-01" },
    { id: "d", title: "D", date: "2026-11-01" },
    { id: "e", title: "E", date: "2025-01-01", done: true },
  ];
  for (const r of [0, 0.4, 0.99])
    assert.ok(
      ["a", "b"].includes(L.rediscoverPick(wishes, { random: () => r }).id),
      "rediscovery comes from the older half",
    );
  assert.equal(
    L.rediscoverPick(
      wishes.map((w) => (w.id === "a" ? { ...w, revisited: "2026-11-04" } : w)),
      { random: () => 0 },
    ).id,
    "b",
    "recently revisited goes to the back",
  );
  assert.equal(L.kindLabel("Restaurant"), "Somewhere to eat");
  assert.equal(L.kindLabel(""), "Idea");

  // ---------- Backups ----------
  const good = {
    format: "chloe-app-backup",
    version: 1,
    app: "world",
    data: {
      items: [
        {
          id: "m1",
          title: "Example",
          date: "2026-11-04",
          type: "Letter",
          chapter: "One to two",
          story: "Hello",
        },
      ],
    },
  };
  assert.equal(L.validateBackup(good, "world").items.length, 1, "copies from earlier versions still restore");
  assert.throws(() =>
    L.validateBackup(
      { ...good, data: { items: [{ id: 'bad" onclick="x', title: "Unsafe", date: "2026-11-04" }] } },
      "world",
    ),
  );
  assert.throws(() => L.validateBackup({ ...good, app: "tea" }, "world"));
  assert.throws(() =>
    L.validateBackup({ ...good, data: { items: [{ id: "m", title: "x", date: "04/11/2026" }] } }, "world"),
  );
  const withPhoto = (image) => ({ ...good, data: { items: [{ ...good.data.items[0], image }] } });
  assert.ok(L.validateBackup(withPhoto("data:image/jpeg;base64,AAAA"), "world"));
  assert.throws(() => L.validateBackup(withPhoto("idb:abc"), "world"));
  assert.throws(() => L.validateBackup(withPhoto("https://example.com/x.jpg"), "world"));
  const teaBackup = (extra, items = []) => ({
    format: "chloe-app-backup",
    version: 1,
    app: "tea",
    data: { items, plan: {}, checked: {}, cooked: {}, custom: [], preferences: { exclude: "" }, ...extra },
  });
  assert.ok(
    L.validateBackup(teaBackup({}, [{ id: "t1", title: "Spag bol" }]), "tea"),
    "a name is enough for a meal",
  );
  assert.ok(
    L.validateBackup(
      teaBackup({}, [
        {
          id: "r1",
          title: "Old",
          minutes: 20,
          effort: "Easy",
          cuisine: "Italian",
          mood: "Fresh",
          ingredients: "x",
          method: "y",
        },
      ]),
      "tea",
    ),
    "old recipe-style meals still restore",
  );
  assert.throws(() => L.validateBackup(teaBackup({}, [{ id: "t1", title: "x", minutes: 0 }]), "tea"));
  assert.throws(() =>
    L.validateBackup(teaBackup({ custom: [{ id: 'x" onmouseover="alert(1)', label: "a" }] }), "tea"),
  );
  assert.throws(() => L.validateBackup(teaBackup({ plan: { "2026-11-04": 'x"><img' } }), "tea"));
  const wishBackup = (items) => ({ format: "chloe-app-backup", version: 1, app: "wish", data: { items } });
  assert.ok(
    L.validateBackup(
      wishBackup([{ id: "w", title: "From etsy.com", link: "https://etsy.com/x", autoTitle: true }]),
      "wish",
    ),
  );
  assert.throws(() =>
    L.validateBackup(wishBackup([{ id: "w", title: "x", link: "javascript:alert(1)" }]), "wish"),
  );
  assert.throws(() => L.validateBackup(wishBackup([{ id: "w", title: "x", price: "lots" }]), "wish"));

  // ---------- Combining two phones ----------
  const mine = {
    items: [
      { id: "x1", title: "Example", sample: true },
      { id: "a", title: "Mine, older edit", updated: "2026-11-01T10:00:00Z" },
      { id: "b", title: "Mine, newer edit", updated: "2026-11-03T10:00:00Z" },
      { id: "c", title: "Deleted on the other phone", updated: "2026-10-01T10:00:00Z" },
    ],
    deleted: { gone: "2026-11-02T10:00:00Z" },
  };
  const theirs = {
    items: [
      { id: "x1", title: "Their example", sample: true },
      { id: "a", title: "Theirs, newer edit", updated: "2026-11-02T10:00:00Z" },
      { id: "b", title: "Theirs, older edit", updated: "2026-11-02T10:00:00Z" },
      { id: "gone", title: "I deleted this", updated: "2026-11-01T10:00:00Z" },
      { id: "new", title: "Only on their phone", updated: "2026-11-04T10:00:00Z" },
    ],
    deleted: { c: "2026-11-02T10:00:00Z" },
    profile: { dob: "2025-08-15" },
  };
  const merged = L.mergeCollections(mine, theirs, "world");
  const titles = Object.fromEntries(merged.data.items.map((i) => [i.id, i.title]));
  assert.deepEqual([merged.added, merged.updated, merged.removed], [1, 1, 1]);
  assert.equal(titles.a, "Theirs, newer edit");
  assert.equal(titles.b, "Mine, newer edit");
  assert.equal(titles.x1, "Example");
  assert.equal(titles.c, undefined);
  assert.equal(titles.gone, undefined);
  assert.equal(merged.data.profile.dob, "2025-08-15");
  const again = L.mergeCollections(merged.data, theirs, "world");
  assert.deepEqual([again.added, again.updated, again.removed], [0, 0, 0]);
  assert.equal(L.changesSince(mine.items, ""), 3);

  console.log(
    "PASS: shopping and gaps, meal upgrades, suggestions by kind of night, dietary settings, links, memories and ages, wishes and rediscovery, backups (old and new), combining phones.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

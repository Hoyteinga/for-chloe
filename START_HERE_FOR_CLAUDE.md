# Handover for Claude

Three personal apps for Chloe: What’s for Tea?, Sophia’s Little World and The Little Wishlist. Read README.md first, then CHANGELOG.md for what changed and why.

The source is plain JavaScript ES modules and CSS, not compiled. `dist` is both the editable source and the runnable static app. Paths are relative.

Run from this folder:
    python -m http.server 8080 --directory dist
Then open http://localhost:8080. Do not open index.html as a file URL.

Product direction (from John’s brief): everyday usefulness over features. Tea is built on their own repertoire of ordinary meals, not recipes; never invent their preferences. Sophia’s Little World records concrete moments in their own words — no literary titles, no sentimental prompts. The wishlist must stay quick to save to and must not feel like a shop, budget or task list. Plain British English; no marketing or AI-sounding sentiment. Keep three distinct looks, iPhone-first.

Keep: local-only storage of family photos, honest wording about backups and sharing (nothing syncs; combining copies is a manual file merge), export/restore, delete confirmations, validation, empty states, and every visible control working.

Data: IndexedDB `chloe-collection` v2 — store `apps` (`tea`, `world`, `wish`, `meta`), store `photos` (`idb:<id>`). Write photo changes and the app record together via `repository.commit`. Keep the v1 JSON backup format. Bump `CACHE` in `sw.js` when cached files change. Upgrades from earlier data live in `upgradeSavedData()` in app.js and `normaliseMeal` / `normaliseMemory` in logic.js.

Before handing back: `node checks.cjs` and `node qa/browser-checks.cjs dist <first dist> <second dist>`. Pure rules go in `logic.js` with a check in `checks.cjs`.

Still needs a real iPhone: Home Screen install, share-sheet export, Photos picker (HEIC → JPEG), keyboard behaviour in bottom sheets, storage persistence, and restoring a large copy.

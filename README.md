# For Chloe — three personal apps

Run `python -m http.server 8080 --directory dist` and open http://localhost:8080. No installation, build, API keys or backend. Publish `dist` to any HTTPS static host (domain root or sub-folder) to add it to an iPhone Home Screen.

## What each app is for
- **What’s for Tea?** Your own list of usual meals, and a quick answer to “what shall we have tonight?”. Pick the kind of night (quick and easy, can’t be bothered, use what we’ve got, something different), get one suggestion at a time, plan the week, and get a combined shopping list.
- **Sophia’s Little World** A plain record of things Sophia says and does: what happened, when, and a photo if you have one. Her words have their own page. Longer stories and letters are there, but secondary.
- **The Little Wishlist** Save something before you forget it — a link, a photo or a name is enough — then find it again, rediscover older ideas, and keep a record of the things you got or did.

## How each works
**Tea.** Starts empty: the first screen offers a tap-to-add list of everyday teas plus a box for your own (one per line). A name is enough; effort, type of meal, shopping items, method, minutes and photo are optional. Meals are either Regular (the default source of suggestions) or To try. Meal types allow freezer, shortcut, no-cooking and takeaway nights. When a suggestion has no effort saved, the app asks once (Hardly any / Easy / Some cooking) and remembers. Favourites, “don’t suggest meals had this week”, dietary settings and exclusions apply. “Fill the week” plans empty days from your regulars without repeats. Planned meals with no shopping items are listed on the shopping page (and in the copied list) so the list never pretends to be complete.

**Sophia.** Two buttons: “She said…” (cursor goes straight to *What did she say?*) and “Something happened”. Date defaults to today, with Today/Yesterday buttons. Kinds: She said, Funny, A first, Day out, Occasion, Moment; Story and Letter under “Longer”. Titles are optional — cards and the viewer lead with the date, photo and words. Optional date of birth shows her age on each memory and sorts the By age page. Search covers words, months and kinds; filters include Photos and Stories & letters. “On this day” appears only when there’s a memory from this date in an earlier year. Examples are made up, labelled, and hidden as soon as there’s a real memory.

**Wishlist.** Save with a link (bare “etsy.com/…” is fine), a photo, a name, or any mix. Optional: why you saved it (shown on the card), kind, collection, where, price, top wish, “something to do together”. Cards without photos get a typographic tile in the kind’s colour. Top wishes sit in a strip at the top. Filters cover favourites, top wishes, together and each kind; search covers names, notes, places and the link’s site. Collections can be opened, renamed or removed (wishes stay). “We got it / We did it” records a date and an optional note in Enjoyed. “Something from a while ago” shows an older idea with Still want it / Got it / Not any more / Show me another.

**All three.** Saved on the phone only (IndexedDB), photos never uploaded. Save a copy (iPhone share sheet → Save to Files or AirDrop), restore or combine copies from another phone, reminders when unsaved changes are a few days old, storage status, delete confirmations, unsaved-change protection, offline after first visit.

## Limitations
- Browser storage isn’t a dependable long-term backup. Clearing website data, changing phones or losing the phone can lose entries. Save copies regularly and keep originals of photos.
- On iPhone, a Safari tab and the Home Screen app keep separate data. Install first, then add personal entries in the Home Screen app.
- No accounts, sync or shared access. Combining copies is a manual file merge. Gift-sharing with secret reservations is described as future work only.
- No video. Videos would make copies too large to save or restore reliably on a phone, so memories take photos only (keep videos in Photos).
- Copies are unencrypted JSON. Photos are resized to 1,600 px JPEG.
- Meal exclusions and dietary settings use what’s saved on each meal; meals with no type saved are still suggested. Not an allergy check.
- Shopping totals add up only exact name-and-unit matches.
- No link previews or scraping, no recipe import, no notifications.
- The dairy-free setting is on by default, carried over from the first version. Turn it off in Tea → Settings if it isn’t wanted.

## Architecture
Buildless ES modules and CSS. `app.js` is the shell (storage, photos, copies, sheets, navigation, routing, upgrades). `tea.js`, `world.js` and `wish.js` each own their screens, editor, detail and actions. `logic.js` holds pure rules (suggestions, shopping, ages, memory types, wish helpers, search, backup validation, combining copies) and is tested without a browser. `store.js` is the persistence adapter. `data.js` holds labelled examples. `sw.js` is the offline shell.

Storage: IndexedDB `chloe-collection`, version 2 — store `apps` (keys `tea`, `world`, `wish`, `meta`) and store `photos` (items refer to `idb:<id>`). Photo and record changes commit in one transaction. Earlier data upgrades in place on launch: photos move out of the app record, old memory kinds map to the new ones, old recipe fields are kept, and untouched old examples are swapped for the new ones (examples someone planned or cooked are kept).

Backups keep the version-1 JSON format. Copies from earlier versions restore here. New fields are optional and titles are always filled (automatically when you don’t write one), so most new copies also restore into the previous version.

## Verification
- `node checks.cjs` — rules: suggestions for each kind of night, shopping gaps, dietary settings, links, ages, memory kinds, rediscovery, backups old and new, combining copies.
- `node qa/browser-checks.cjs dist <first-version dist> <second-version dist>` — journeys in headless Chromium at 390 × 844. See `qa/README.md`.
- Not yet tested on a real iPhone: Home Screen install, the share sheet, choosing from Photos (HEIC), keyboard behaviour in sheets, storage persistence, and restoring a large copy.

# Changelog

## Version 3 — 4 November 2026 (John’s revised brief)

### What’s for Tea?
- Rebuilt around your own list of usual meals. Starts empty; the first screen offers a tap-to-add list of everyday teas plus a box for your own. Nothing is assumed until you tap it.
- A name is enough. Effort, type of meal (cooked, shortcut, freezer, no cooking, takeaway), shopping items, method, minutes and photo are optional.
- Regulars and To try are separate. Suggestions come from regulars; “Something different” leads with To try.
- Tonight asks what sort of night it is: Quick and easy, Can’t be bothered, Use what we’ve got, Something different, or Just pick something. One suggestion at a time, with Another and Have it tonight.
- Meals with no effort saved are still offered; the app asks once and remembers.
- Our meals: one-box quick add that keeps the keyboard up, regulars sorted A–Z, last-had dates, favourites.
- Week: “Fill the week” from regulars without repeats; meals with no shopping items are flagged.
- Shopping: meals with no items are listed at the top, with a shortcut to add them, and named in the copied list.
- The six cookbook examples are gone (kept only if you’d planned or cooked one).

### Sophia’s Little World
- Two buttons: “She said…” and “Something happened”. The cursor starts in the box; the date is today, with Today/Yesterday buttons. Titles are optional and off the main form.
- Her exact words have their own page, “She said”, and are shown in quotation marks everywhere.
- Kinds: She said, Funny, A first, Day out, Occasion, Moment; Story and Letter under “Longer”. Old kinds map across automatically.
- Cards and the viewer lead with date, photo and words; the viewer steps Older/Newer.
- The intro headings and the “Remember this day?” panel are gone. “On this day” appears only when there’s something to show.
- By age uses the optional date of birth (“Her first year”, “One year old”…).
- New examples are short, concrete and labelled as made up, and disappear once there’s a real memory.

### The Little Wishlist
Checked against the six uses in the brief:
- **Save it before I forget:** a link, photo or name alone is enough; “etsy.com/…” is tidied to a full link; everything else optional.
- **A place to remember:** kinds read naturally (Somewhere to eat, Somewhere to go…), plus an optional Where shown on the card.
- **Do this together:** a “Together” tick and filter.
- **What was that thing?:** search covers names, notes, places and the link’s site; cards show why it was saved.
- **Which do I really want?:** top wishes sit in a strip at the top; favourites stay as hearts.
- **We got it or did it:** records the date and an optional note in Enjoyed, grouped by year.
- Cards without photos get a coloured tile with the name and site, not an empty box.
- Collections are optional and can be renamed or removed (wishes stay); there’s a “Not in a collection” group.
- “Something from a while ago” offers Still want it, Got it, Not any more and Show me another.
- Gift sharing is described honestly as future work.

### All three
- Plain wording throughout. Settings pages share one “Keeping it safe” section that says plainly storage isn’t a dependable backup.
- Examples step aside as soon as there’s real content.
- The “Save a copy?” reminder no longer appears on the day you start.
- Fixed: an editor section that should have hidden stayed visible, because a style overrode the `hidden` attribute.
- Fixed: the phone’s own link check blocked links typed without “https://”.
- Each app now owns its screens, editor and actions (tea.js, world.js, wish.js); app.js is the shared shell.

## Version 2 — 4 November 2026

### Why: what the first version got wrong
- **Photos had a ceiling.** Every photo lived inside one database record per app, rewritten on every tap. In Chromium a single record tops out around 127 MB — a few hundred phone photos at the app’s 1,600 px size (about 450 in testing; fewer if photos are detailed) — after which nothing in that app can be saved. A baby journal reaches that within a year or two. Every launch also loaded every photo into memory.
- **Data could quietly vanish on iPhone.** Nothing warned that a Safari tab and the Home Screen app keep separate storage, or that Safari can clear data for sites not visited for a while. Nothing asked the browser to keep the data, and nothing nudged anyone to save a copy.
- **Export was awkward on iPhone**: a download link, which inside a Home Screen app can open a preview with no way back.
- **Search matched photo data.** It searched the raw record, including the base64 photo, so short queries matched almost every entry once photos existed. Every keystroke also rebuilt the page, including the search box (risking the iPhone keyboard closing).
- **Smaller defects**: double side margins on the landing page; the Tonight shortlist ignored vegan/vegetarian settings and exclusions; exclusions matched units (“g” excluded everything); a crafted backup could inject markup through shopping-list ids; shopping ticks persisted into later weeks; an empty or broken file gave a raw error; Escape or a stray tap discarded half-written memories; fonts were TrueType files named `.woff2`; absolute paths stopped it working in a sub-folder; the offline cache missed fonts and images.

### Data safety
- Photos stored one per record in a new `photos` store; app records stay small (77 KB with 450 photos in testing). Photo and record changes commit together. Version-1 data upgrades automatically and losslessly on first launch.
- Photos load only as they scroll near the screen.
- Save a copy: iPhone share sheet (Save to Files, AirDrop), download elsewhere; built in pieces so large collections don’t become one giant string.
- Restore or combine: replace this app with a copy, or combine a copy from another phone — new entries added, newest edit wins, deletions carried across, examples untouched.
- Reminders when three changes, or a fortnight-old change, exist only on this device; “Later” snoozes for a week.
- Storage panel: last copy saved, whether the browser has agreed to keep the data, space used, and a button to ask.
- Home Screen advice in Safari tabs on iPhone, including how to move entries already added in Safari.
- Backup format unchanged (version 1); new copies still restore into the first version.

### Usability and functionality
- Bottom-sheet dialogs on phones; background no longer scrolls behind them.
- Editors: photo preview, words-first order in the journal, protection against losing unsaved changes, collection-name suggestions in the wishlist.
- Search covers only the words people wrote (plus month names in the journal) and updates results without rebuilding the search box.
- Tea: Tonight shows tonight’s planned meal; shortlist follows all dietary settings and puts favourites first; numbered method steps and an aligned ingredients list; meal thumbnails in the week; ticks reset when an ingredient leaves the plan; “Recently cooked” sorted by date.
- Journal: optional date of birth gives “14 months old” labels and automatic chapter suggestions; timeline grouped by month; chapters read in order like a book.
- Wishlist: Collections shows a cover per collection; enjoyed wishes record their date; whole-pound prices read £35.
- Transparent PNGs flatten onto white; photos up to 30 MB; clearer file errors.

### Look and feel
- Landing page gutters fixed; header aligned.
- Journal cards without a photo lead with the words (quote style; letters on ruled paper) instead of an empty lavender box.
- Month headings with hairlines in the timeline; collection covers with titles over a soft gradient in the wishlist.
- Per-app browser theme colour; heading font preloaded; offline shell includes fonts and images.

### Engineering
- Readable, formatted source; pure rules in `logic.js` with Node checks; 28 browser checks in `qa/`.
- Relative paths throughout; service-worker cache `chloe-shell-v2`; fonts renamed `.ttf`.
- Another open tab updates when data changes; a blocked database upgrade explains itself.

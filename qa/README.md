# Browser checks

Journeys in headless Chromium at iPhone size (390 × 844, en-GB).

    npm i playwright sharp
    npx playwright install chromium
    node qa/browser-checks.cjs dist [first-version dist] [second-version dist] [screenshot folder]

Use `-` to skip an earlier version. With earlier versions given, the first checks create data in each old version (own memory with photo, recipe, favourite, enjoyed wish, planned meal, date of birth), reload into this version and confirm it all survived.

Then: Tea (adding usual teas, each kind of night, teaching effort, quick add, to-try, week, shopping gaps, copied list, delete, exclusions), Sophia (She said in three steps, Something happened with photo and Yesterday, validation, letters, search and filters, She said page, viewer, ages, On this day, delete), Wishlist (link-only, photo-only, validation, card contents, filters, search, collections rename/remove, We did it with note, rediscovery), a sweep that taps every visible control on all 13 screens and fails if any does nothing, copies across two phones, sideways scrolling and touch-target sizes, and offline reopening.

Chromium is not Safari. These checks don’t cover Home Screen install, the share sheet, the Photos picker or the iPhone keyboard.

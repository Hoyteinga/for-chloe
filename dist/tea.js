// What's for Tea? — built around the meals you actually have, not a recipe book.
import {
  EFFORTS,
  EVERYDAY_TEAS,
  MEAL_SORTS,
  hasShopping,
  isoDay,
  mealsWithoutShopping,
  parseIngredientLines,
  shoppingItems as totals,
  suggestMeals,
} from "./logic.js";

const MOODS = {
  quick: { label: "Quick and easy", hint: "Not much time or effort" },
  lazy: { label: "Can’t be bothered", hint: "Freezer, leftovers, takeaway" },
  have: { label: "Use what we’ve got", hint: "Say what needs using up" },
  different: { label: "Something different", hint: "Not had for a while, or new" },
};

export function createTea(core) {
  const { esc, btn, empty, chips, searchbar, select, field, area, pills, photoField, img, sample, visible } =
    core;
  const { sheet, closeSheet, toast, render, refreshResults, mutate, today, nowIso, ago, uid } = core;
  const ui = core.ui;
  const t = () => core.state.tea;
  let suggestion = null;

  // ---------- Helpers ----------

  const meals = () => visible(t().items);
  const find = (id) => t().items.find((m) => m.id === id);
  const lastHad = (m) => t().cooked[m.id];
  const lastHadText = (m) => (lastHad(m) ? `Last had ${ago(lastHad(m))}` : "Not had yet");
  const hadToday = (m) => lastHad(m) && isoDay(new Date(lastHad(m))) === today();
  const tags = (m) =>
    [m.list === "try" ? "To try" : "", m.effort, m.sort, m.minutes ? `${m.minutes} min` : ""].filter(Boolean);
  const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const byName = (a, b) => a.title.localeCompare(b.title, "en-GB");
  const data = (id) => `data-id="${esc(id)}"`;

  function weekDates() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return Array.from({ length: 7 }, (_, n) => {
      const x = new Date(d);
      x.setDate(d.getDate() + n);
      return {
        x: isoDay(x),
        label: n === 0 ? "Tonight" : x.toLocaleDateString("en-GB", { weekday: "short" }),
        long: n === 0 ? "Tonight" : x.toLocaleDateString("en-GB", { weekday: "long" }),
        day: x.getDate(),
      };
    });
  }
  const shoppingNow = () =>
    totals(
      t().items,
      t().plan,
      weekDates().map((d) => d.x),
    );
  /** Forget ticks for things no longer on the list, so next week's list starts fresh. */
  function pruneTicks(x) {
    const days = weekDates().map((d) => d.x);
    const live = new Set([...totals(x.items, x.plan, days).map((i) => i.key), ...x.custom.map((c) => c.id)]);
    for (const k of Object.keys(x.checked)) if (!live.has(k)) delete x.checked[k];
  }
  const thumb = (m, cls = "meal-thumb") =>
    m.image
      ? img(m.image, "", cls)
      : `<span class="${cls} initial" aria-hidden="true">${esc(m.title.trim().charAt(0).toUpperCase())}</span>`;

  // ---------- Tonight ----------

  function tonight() {
    if (!t().items.length)
      return `<section class="start"><h1>What do you usually have for tea?</h1><p>Add the meals you have most weeks. A name is enough. Suggestions for tonight then come from your own list.</p>${btn("Add our usual teas", "quick-pick", "primary big")}<p class="small">Or add them one at a time in <button type="button" class="textbtn" data-tab="meals">Our meals</button>.</p></section>`;
    const day = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const planned = find(t().plan[today()]);
    const top = planned
      ? `<section class="tonight-card">${planned.image ? img(planned.image, planned.title, "tonight-img") : ""}<div><span class="eyebrow">Tonight</span><h2>${esc(planned.title)}</h2>${tags(planned).length ? `<p class="small">${tags(planned).map(esc).join(" · ")}</p>` : ""}<div class="row wrap">${btn(hadToday(planned) ? "Had it ✓" : "We had this", "cooked", "primary", data(planned.id))}${btn("Change", "unplan-tonight")}${btn("See meal", "open-meal", "textbtn", data(planned.id))}</div></div></section>`
      : `<section class="moods"><h2>What sort of night is it?</h2><div class="mood-grid">${Object.entries(
          MOODS,
        )
          .map(
            ([k, m]) =>
              `<button type="button" class="mood mood-${k}" data-action="suggest" data-mood="${k}"><strong>${m.label}</strong><span>${m.hint}</span></button>`,
          )
          .join("")}</div>${btn("Just pick something", "suggest", "textbtn", 'data-mood="any"')}</section>`;
    const coming = weekDates()
      .slice(1)
      .map((d) => ({ d, m: find(t().plan[d.x]) }))
      .filter((x) => x.m);
    const examples = core.examplesShowing()
      ? `<p class="small notice">These are examples. ${btn("Add your usual teas", "quick-pick", "textbtn")} to get suggestions from your own list.</p>`
      : "";
    return `<header class="day-head"><h1>Tonight</h1><p>${day}</p></header>${examples}${top}${
      coming.length
        ? `<section class="coming"><h3>Coming up</h3><ul>${coming.map(({ d, m }) => `<li><button type="button" data-open="${esc(m.id)}"><span>${d.label} ${d.day}</span>${esc(m.title)}</button></li>`).join("")}</ul></section>`
        : ""
    }`;
  }

  function startSuggest(mood, have = "") {
    const list = suggestMeals(t().items, { mood, have, prefs: t().preferences, cooked: t().cooked });
    suggestion = { mood, have, list, index: 0 };
    showSuggestion();
  }

  function showSuggestion() {
    const s = suggestion;
    const label = s.mood === "any" ? "Just pick something" : MOODS[s.mood].label;
    if (!s.list.length) {
      const own = t().items.filter((m) => !m.sample);
      const copy =
        s.mood === "have"
          ? `None of your meals mention ${esc(s.have)}. Matching uses meal names and any saved shopping items.`
          : !own.length
            ? "There’s nothing on your list yet."
            : "Nothing fits right now. Your settings, or meals had in the last week, may be ruling things out.";
      sheet(
        label,
        `<p class="gap">${copy}</p><div class="detail-actions">${!own.length ? btn("Add our usual teas", "quick-pick", "primary") : btn("Check settings", "settings-tab")}${s.mood !== "any" ? btn("Just pick something", "suggest", "secondary", 'data-mood="any"') : ""}</div>`,
      );
      return;
    }
    const { meal, why, unknown, used } = s.list[s.index % s.list.length];
    const reason =
      why === "have" ? `Uses ${used.join(", ")}` : why === "try" ? "On your list to try" : lastHadText(meal);
    const facts = [...tags(meal).filter((x) => x !== "To try"), reason].filter(Boolean);
    sheet(
      label,
      `<div class="suggestion reveal">${meal.image ? img(meal.image, meal.title, "suggest-img") : ""}<h3 class="suggest-name">${esc(meal.title)}</h3><p class="small">${facts.map(esc).join(" · ")}</p>${
        unknown
          ? `<div class="teach"><span>How much effort is this one?</span><div class="row wrap">${EFFORTS.map((x) => btn(x, "teach", "pill", `${data(meal.id)} data-effort="${x}"`)).join("")}</div></div>`
          : ""
      }<div class="detail-actions">${btn("Have it tonight", "tonight", "primary", data(meal.id))}${s.list.length > 1 ? btn("Another", "another") : ""}</div><p>${btn("See the meal", "open-meal", "textbtn", data(meal.id))}</p></div>`,
    );
  }

  // ---------- Our meals ----------

  function mealsView() {
    const all = meals();
    let items = all.filter((m) => core.matches(m));
    if (ui.filter === "Regulars") items = items.filter((m) => m.list !== "try").sort(byName);
    else if (ui.filter === "To try") items = items.filter((m) => m.list === "try");
    else if (ui.filter === "Favourites") items = items.filter((m) => m.favourite).sort(byName);
    else if (ui.filter === "Recently had")
      items = items.filter((m) => lastHad(m)).sort((a, b) => lastHad(b).localeCompare(lastHad(a)));
    const counts = {
      Regulars: all.filter((m) => m.list !== "try").length,
      "To try": all.filter((m) => m.list === "try").length,
    };
    const emptyCopy = ui.query.trim()
      ? empty("No matches", "Try another word.")
      : ui.filter === "To try"
        ? empty(
            "Nothing to try yet",
            "Saw something you fancy making? Add it above and it stays separate from your regulars.",
          )
        : ui.filter === "Regulars"
          ? empty(
              "No regulars yet",
              "Add the meals you have most weeks.",
              "quick-pick",
              "Add several at once",
            )
          : empty("Nothing here yet", "");
    return `<header class="day-head"><h1>Our meals</h1></header><form id="meal-quick" class="toolbar quick-add"><input name="title" required maxlength="80" placeholder="${ui.filter === "To try" ? "Something to try" : "Add a meal, e.g. jacket potatoes"}" aria-label="Meal name" autocomplete="off" enterkeyhint="done"><button class="primary">Add</button></form><p class="quick-more">${btn("Add several at once", "quick-pick", "textbtn")}</p>${chips(["Regulars", "To try", "Favourites", "Recently had"], { Regulars: `Regulars ${counts.Regulars}`, "To try": `To try ${counts["To try"]}` })}${all.length > 8 ? searchbar("Search meals or shopping items…") : ""}<div id="results">${
      items.length
        ? `<ul class="meal-list">${items
            .map(
              (m) =>
                `<li class="meal-row"><button type="button" class="meal-open" data-open="${esc(m.id)}">${thumb(m)}<span class="meal-text"><strong>${esc(m.title)}</strong><small>${[...tags(m).filter((x) => x !== "To try"), lastHadText(m)].map(esc).join(" · ")} ${sample(m)}</small></span></button>${btn(m.favourite ? "♥" : "♡", "favourite", "like", `${data(m.id)} aria-label="${m.favourite ? "Remove from" : "Add to"} favourites" aria-pressed="${!!m.favourite}"`)}</li>`,
            )
            .join("")}</ul>`
        : emptyCopy
    }</div>`;
  }

  function quickPick() {
    const have = new Set(
      t()
        .items.filter((i) => !i.sample)
        .map((i) => i.title.trim().toLowerCase()),
    );
    const offer = EVERYDAY_TEAS.filter((x) => !have.has(x.title.toLowerCase()));
    sheet(
      "Add your usual teas",
      `<form id="quickpick-form" class="stack"><p class="small">Tap the ones you have regularly. Nothing is added until you press Add.</p><div class="pick-grid">${offer
        .map(
          (x) =>
            `<label class="pick"><input type="checkbox" name="pick" value="${esc(x.title)}"><span>${esc(x.title)}</span></label>`,
        )
        .join(
          "",
        )}</div><label class="field">Anything else? One per line<textarea name="lines" rows="4" placeholder="e.g. halloumi wraps"></textarea></label><p id="pick-error" class="small danger" role="alert"></p><button class="primary">Add these</button></form>`,
    );
  }

  function detail(id) {
    const m = find(id);
    if (!m) return;
    const shop = parseIngredientLines(m.ingredients);
    const steps = String(m.method || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const shopping =
      m.sort === "Takeaway"
        ? ""
        : shop.length
          ? `<h3 class="gap">Shopping</h3><ul class="ingredients">${shop.map((l) => (l.rawName ? `<li><span>${esc(l.amount)}</span>${esc(l.rawName)}</li>` : `<li><span></span>${esc(l.line)}</li>`)).join("")}</ul>`
          : `<div class="notice gap">No shopping items saved for this meal, so planning it won’t add anything to the shopping list. ${btn("Add shopping items", "edit", "textbtn", `${data(id)} data-focus="ingredients"`)}</div>`;
    sheet(
      esc(m.title),
      `<div class="reveal">${sample(m)}${img(m.image, m.title, "detail-img")}<p class="small">${[...tags(m), lastHadText(m)].map(esc).join(" · ")}</p><div class="detail-actions">${btn("Have it tonight", "tonight", "primary", data(id))}${btn("Plan a night", "plan-meal", "secondary", data(id))}${btn(hadToday(m) ? "Had it today ✓" : "We had this", "cooked", "secondary", data(id))}</div>${m.list === "try" ? `<p class="gap">${btn("Move to regulars", "make-regular", "textbtn", data(id))}</p>` : ""}${shopping}${steps.length ? `<h3 class="gap">How we make it</h3><ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}<div class="detail-actions">${btn("Edit", "edit", "textbtn", data(id))}${btn("Delete", "delete", "textbtn danger", data(id))}</div></div>`,
    );
  }

  function editor(id, opts = {}) {
    const m = find(id) || { list: ui.filter === "To try" ? "try" : "regular" };
    const open =
      opts.focus === "ingredients" ||
      !!(m.ingredients || m.method || m.minutes || m.diet || m.dairy || m.image);
    const fields =
      field(
        "title",
        "Meal",
        m.title,
        "text",
        `required ${id ? "" : "autofocus"} placeholder="e.g. chicken wraps"`,
      ) +
      pills(
        "list",
        "Which list?",
        [
          ["regular", "Regular"],
          ["try", "To try"],
        ],
        m.list || "regular",
      ) +
      pills("effort", "How much effort?", [...EFFORTS, ["", "Not sure"]], m.effort || "") +
      pills("sort", "What sort of meal?", [...MEAL_SORTS, ["", "Not sure"]], m.sort || "") +
      `<details class="more span" ${open ? "open" : ""}><summary>More (all optional)</summary><div class="form-grid">` +
      area(
        "ingredients",
        "Shopping items, one per line",
        m.ingredients,
        `rows="5" placeholder="mince&#10;spaghetti&#10;1 jar | pasta sauce"`,
      ) +
      `<p class="small span hint-left">To add amounts up across the week, put a bar between the amount and the item: <em>500 g | mince</em>.</p>` +
      area("method", "How we make it", m.method, 'rows="4"') +
      field("minutes", "Minutes", m.minutes || "", "number") +
      select("diet", "Type", [["", "Not set"], "Vegan", "Vegetarian", "Fish", "Meat"], m.diet || "") +
      `<label class="check span"><input name="dairy" type="checkbox" ${m.dairy ? "checked" : ""}>Contains dairy</label>` +
      photoField(m) +
      `</div></details>`;
    sheet(
      id ? "Edit meal" : "Add a meal",
      `<form id="edit-form" data-id="${esc(id || "")}" class="stack"><div class="form-grid">${fields}</div><p id="form-error" role="alert" class="small danger"></p><button class="primary">${id ? "Save" : "Add meal"}</button></form>`,
    );
    if (opts.focus === "ingredients") core.modal.querySelector('[name="ingredients"]')?.focus();
  }

  function prepare(entry, d, existing) {
    entry.title = String(entry.title || "").trim();
    if (!entry.title) throw Error("Give the meal a name.");
    if (t().items.some((m) => m.id !== entry.id && !m.sample && sameName(m.title, entry.title)))
      throw Error("That meal is already on your list.");
    entry.list = entry.list === "try" ? "try" : "regular";
    entry.effort = EFFORTS.includes(entry.effort) ? entry.effort : "";
    entry.sort = MEAL_SORTS.includes(entry.sort) ? entry.sort : "";
    if (entry.minutes === "" || entry.minutes === undefined || entry.minutes === null) delete entry.minutes;
    else {
      entry.minutes = Number(entry.minutes);
      if (!(entry.minutes >= 1 && entry.minutes <= 1440))
        throw Error("Minutes should be between 1 and 1,440.");
    }
    entry.diet = ["Vegan", "Vegetarian", "Fish", "Meat"].includes(entry.diet) ? entry.diet : "";
    entry.dairy = d.has("dairy");
    entry.ingredients = String(entry.ingredients || "").trim();
    entry.method = String(entry.method || "").trim();
    return entry;
  }

  // ---------- The week ----------

  function week() {
    const all = meals();
    if (!all.length)
      return `<header class="day-head"><h1>The week</h1></header>${empty("Nothing to plan with yet", "Add the meals you usually have first.", "quick-pick", "Add our usual teas")}`;
    const regulars = all.filter((m) => m.list !== "try").sort(byName);
    const tries = all.filter((m) => m.list === "try").sort(byName);
    const option = (m, sel) =>
      `<option value="${esc(m.id)}" ${sel === m.id ? "selected" : ""}>${esc(m.title)}</option>`;
    const days = weekDates();
    const gaps = days.filter((d) => !find(t().plan[d.x])).length;
    return `<header class="day-head"><h1>The week</h1><p>The next seven days.</p></header>${days
      .map((d) => {
        const planned = find(t().plan[d.x]);
        const sel = planned?.id;
        return `<div class="plan-row ${planned ? "planned" : ""}"><div><span class="day">${d.label}</span>${d.label === "Tonight" ? "" : `<br><small>${d.day}</small>`}</div><div class="plan-pick">${planned ? thumb(planned, "plan-thumb") : ""}<div class="plan-select"><select aria-label="Meal for ${d.long}" data-plan="${d.x}"><option value="">Nothing planned</option><optgroup label="Regulars">${regulars.map((m) => option(m, sel)).join("")}</optgroup>${tries.length ? `<optgroup label="To try">${tries.map((m) => option(m, sel)).join("")}</optgroup>` : ""}</select>${planned && !hasShopping(planned) && planned.sort !== "Takeaway" ? `<small class="no-shop">No shopping items saved</small>` : ""}</div></div>${planned ? btn("×", "clear-day", "", `data-day="${d.x}" aria-label="Clear ${d.long}"`) : "<span></span>"}</div>`;
      })
      .join(
        "",
      )}<div class="row wrap gap">${gaps ? btn(`Fill ${gaps === 7 ? "the week" : "empty days"}`, "fill-week", "secondary") : ""}<button type="button" class="primary" data-tab="list">Shopping list →</button></div>`;
  }

  // ---------- Shopping ----------

  function shopping() {
    const days = weekDates();
    const items = [...shoppingNow(), ...t().custom.map((x) => ({ key: x.id, label: x.label, custom: true }))];
    const gaps = mealsWithoutShopping(
      t().items,
      t().plan,
      days.map((d) => d.x),
    );
    const planned = days.filter((d) => find(t().plan[d.x])).length;
    const left = items.filter((i) => !t().checked[i.key]).length;
    const dayName = (x) => days.find((d) => d.x === x)?.label || "";
    return `<header class="day-head"><h1>Shopping</h1><p>${left} to get · from ${planned} planned meal${planned === 1 ? "" : "s"}</p></header>${
      gaps.length
        ? `<div class="notice gaps"><strong>Not on the list yet.</strong> ${gaps.length === 1 ? "This meal has" : "These meals have"} no shopping items saved. Add what you need below, or save items to the meal.<ul>${gaps.map((g) => `<li><span>${dayName(g.day)} · ${esc(g.meal.title)}</span>${btn("Add items", "edit", "textbtn", `${data(g.meal.id)} data-focus="ingredients"`)}</li>`).join("")}</ul></div>`
        : ""
    }<form id="custom-form" class="toolbar"><input name="item" required maxlength="150" aria-label="Add to the list" placeholder="Add something else" autocomplete="off" enterkeyhint="done"><button class="primary">Add</button></form>${items
      .map(
        (i) =>
          `<div class="shopping ${t().checked[i.key] ? "done" : ""}"><input id="s-${esc(i.key)}" type="checkbox" data-check="${esc(i.key)}" ${t().checked[i.key] ? "checked" : ""}><label for="s-${esc(i.key)}">${esc(i.label)}</label>${i.custom ? btn("×", "delete-custom", "", `${data(i.key)} aria-label="Remove ${esc(i.label)}"`) : ""}</div>`,
      )
      .join("")}${
      !items.length && !gaps.length
        ? planned
          ? empty("Nothing on the list", "Add anything you need above.")
          : `<div class="empty"><h3>Nothing on the list</h3><p>Plan some meals and their shopping items appear here.</p><button type="button" class="primary" data-tab="week">Plan the week</button></div>`
        : ""
    }${items.length ? `<div class="detail-actions">${btn("Copy list", "copy-list")}${btn("Untick everything", "untick")}</div>` : ""}`;
  }

  // ---------- Settings ----------

  function settings() {
    const p = t().preferences;
    return `<header class="day-head"><h1>Settings</h1></header><form id="prefs-form" class="stack about"><h2 class="section-h">Suggestions</h2><label class="check"><input name="avoid" type="checkbox" ${p.avoid ? "checked" : ""}>Don’t suggest meals we’ve had in the last week</label><label class="check"><input name="dairy" type="checkbox" ${p.dairy ? "checked" : ""}>Skip meals marked as containing dairy</label>${select(
      "diet",
      "Only suggest",
      [
        ["Anything", "Anything"],
        ["Vegetarian", "Vegetarian and vegan meals"],
        ["Vegan", "Vegan meals"],
      ],
      p.diet || "Anything",
    )}${field("exclude", "Never suggest meals with", p.exclude, "text", 'placeholder="e.g. mushrooms, olives"')}<p class="small">These use what’s saved on each meal. Meals without a type are still suggested. Exclusions match meal names and shopping items; they aren’t an allergy check.</p><button class="primary">Save settings</button></form>${core.keepingSafe()}`;
  }

  // ---------- Wiring ----------

  return {
    tabs: [
      ["choose", "Tonight"],
      ["meals", "Our meals"],
      ["week", "The week"],
      ["list", "Shopping"],
      ["settings", "Settings"],
    ],
    defaultTab: "choose",
    defaultFilter: (tab) => (tab === "meals" ? "Regulars" : "All"),
    view() {
      if (ui.tab === "settings") return settings();
      if (ui.tab === "week") return week();
      if (ui.tab === "list") return shopping();
      if (ui.tab === "meals") return mealsView();
      return tonight();
    },
    detail,
    editor,
    prepare,
    savedMessage: (m, isNew) => (isNew ? `Added ${m.title}` : "Saved"),
    onDelete(next, id) {
      next.plan = Object.fromEntries(Object.entries(next.plan).filter(([, v]) => v !== id));
      next.cooked = { ...next.cooked };
      delete next.cooked[id];
      return next;
    },
    onClearSamples(next) {
      next.plan = Object.fromEntries(
        Object.entries(next.plan).filter(([, v]) => next.items.some((m) => m.id === v)),
      );
      return next;
    },
    async onChange(e) {
      if (e.target.dataset.plan !== undefined) {
        await mutate(
          (x) => {
            if (e.target.value) x.plan[e.target.dataset.plan] = e.target.value;
            else delete x.plan[e.target.dataset.plan];
            pruneTicks(x);
          },
          e.target.value ? "Planned" : "Cleared",
        );
        render();
      }
      if (e.target.dataset.check !== undefined) {
        await mutate((x) => {
          x.checked[e.target.dataset.check] = e.target.checked;
        });
        render();
      }
    },
    actions: {
      suggest(el) {
        if (el.dataset.mood === "have")
          return sheet(
            MOODS.have.label,
            `<form id="have-form" class="stack gap"><label class="field">What needs using up?<input name="have" autofocus autocomplete="off" placeholder="e.g. chicken, peppers" value="${esc(suggestion?.have || "")}"></label><p class="small">Matches meal names and any saved shopping items.</p><button class="primary">Find meals</button></form>`,
          );
        startSuggest(el.dataset.mood);
      },
      another() {
        suggestion.index++;
        showSuggestion();
      },
      async teach(el, m) {
        if (!m) return;
        await mutate(() => {
          m.effort = el.dataset.effort;
          m.updated = nowIso();
        }, `Saved: ${el.dataset.effort.toLowerCase()} effort`);
        const fits = suggestion.mood === "quick" ? m.effort !== "Some cooking" : m.effort === "Hardly any";
        suggestion.list[suggestion.index % suggestion.list.length].unknown = false;
        if (!fits) suggestion.list = suggestion.list.filter((s) => s.meal.id !== m.id);
        showSuggestion();
      },
      async tonight(el, m) {
        if (!m) return;
        await mutate((x) => {
          x.plan[today()] = m.id;
          pruneTicks(x);
        }, `Tonight: ${m.title}`);
        closeSheet();
        ui.tab = "choose";
        render();
      },
      async "unplan-tonight"() {
        await mutate((x) => {
          delete x.plan[today()];
          pruneTicks(x);
        });
        render();
      },
      "open-meal": (el) => detail(el.dataset.id),
      async cooked(el, m) {
        if (!m) return;
        await mutate((x) => {
          x.cooked[m.id] = nowIso();
        }, "Noted");
        if (core.modal.open) detail(m.id);
        render();
      },
      "quick-pick": quickPick,
      "settings-tab": () => core.setTab("settings"),
      async "make-regular"(el, m) {
        await mutate(() => {
          m.list = "regular";
          m.updated = nowIso();
        }, "Moved to regulars");
        detail(m.id);
        render();
      },
      "plan-meal"(el, m) {
        sheet(
          "Which day?",
          `<div class="stack gap">${weekDates()
            .map((d) => {
              const other = find(t().plan[d.x]);
              return btn(
                `${d.long}${d.label === "Tonight" ? "" : ` ${d.day}`}${other ? ` · instead of ${esc(other.title)}` : ""}`,
                "set-meal",
                "secondary day-choice",
                `${data(m.id)} data-day="${d.x}"`,
              );
            })
            .join("")}</div>`,
        );
      },
      async "set-meal"(el, m) {
        await mutate((x) => {
          x.plan[el.dataset.day] = m.id;
          pruneTicks(x);
        }, "Planned");
        closeSheet();
        render();
      },
      async "clear-day"(el) {
        await mutate((x) => {
          delete x.plan[el.dataset.day];
          pruneTicks(x);
        });
        render();
      },
      async "fill-week"() {
        const empties = weekDates().filter((d) => !find(t().plan[d.x]));
        const used = new Set(Object.values(t().plan));
        const picks = suggestMeals(t().items, { mood: "any", prefs: t().preferences, cooked: t().cooked })
          .map((s) => s.meal)
          .filter((m) => !used.has(m.id));
        const n = Math.min(empties.length, picks.length);
        if (!n) return toast("Add a few more meals first");
        await mutate(
          (x) => {
            empties.slice(0, n).forEach((d, k) => (x.plan[d.x] = picks[k].id));
            pruneTicks(x);
          },
          `Planned ${n} day${n === 1 ? "" : "s"}. Change any you like.`,
        );
        render();
      },
      async "delete-custom"(el) {
        await mutate((x) => {
          x.custom = x.custom.filter((c) => c.id !== el.dataset.id);
          delete x.checked[el.dataset.id];
        });
        render();
      },
      async untick() {
        await mutate((x) => {
          x.checked = {};
        }, "All unticked");
        render();
      },
      async "copy-list"() {
        const days = weekDates();
        const gaps = mealsWithoutShopping(
          t().items,
          t().plan,
          days.map((d) => d.x),
        );
        const lines = [
          ...shoppingNow()
            .filter((x) => !t().checked[x.key])
            .map((x) => x.label),
          ...t()
            .custom.filter((x) => !t().checked[x.id])
            .map((x) => x.label),
        ];
        if (gaps.length)
          lines.push("", `Still to add things for: ${gaps.map((g) => g.meal.title).join(", ")}`);
        const list = lines.join("\n");
        try {
          await navigator.clipboard.writeText(list);
          toast("List copied");
        } catch {
          sheet(
            "Your shopping list",
            `<textarea aria-label="Copy this list" rows="12">${esc(list)}</textarea>`,
          );
        }
      },
    },
    forms: {
      async "meal-quick"(f, d) {
        const title = String(d.get("title") || "").trim();
        if (!title) return;
        if (t().items.some((m) => !m.sample && sameName(m.title, title)))
          return toast("Already on your list");
        const list = ui.filter === "To try" ? "try" : "regular";
        await mutate((x) => {
          x.items.unshift({ id: uid(), title, list, effort: "", sort: "", updated: nowIso() });
        }, `Added ${title}`);
        f.reset();
        if (!["Regulars", "To try"].includes(ui.filter)) ui.filter = list === "try" ? "To try" : "Regulars";
        const chipsEl = core.$(".chips");
        if (chipsEl)
          chipsEl.outerHTML = chips(["Regulars", "To try", "Favourites", "Recently had"], {
            Regulars: `Regulars ${meals().filter((m) => m.list !== "try").length}`,
            "To try": `To try ${meals().filter((m) => m.list === "try").length}`,
          });
        refreshResults();
        f.querySelector("input")?.focus();
      },
      async "quickpick-form"(f, d) {
        const existing = new Set(
          t()
            .items.filter((m) => !m.sample)
            .map((m) => m.title.trim().toLowerCase()),
        );
        const picked = d
          .getAll("pick")
          .map((title) => EVERYDAY_TEAS.find((x) => x.title === title))
          .filter(Boolean);
        const typed = String(d.get("lines") || "")
          .split("\n")
          .map((s) => s.trim().slice(0, 80))
          .filter(Boolean)
          .map((title) => ({ title, effort: "", sort: "" }));
        const add = [];
        for (const m of [...picked, ...typed]) {
          const k = m.title.toLowerCase();
          if (existing.has(k)) continue;
          existing.add(k);
          add.push(m);
        }
        if (!add.length) {
          f.querySelector("#pick-error").textContent = "Tap a meal or type one first.";
          return;
        }
        await mutate(
          (x) => {
            for (const m of [...add].reverse())
              x.items.unshift({
                id: uid(),
                title: m.title,
                list: "regular",
                effort: m.effort,
                sort: m.sort,
                updated: nowIso(),
              });
          },
          `Added ${add.length} meal${add.length === 1 ? "" : "s"}`,
        );
        closeSheet();
        if (ui.tab === "meals") ui.filter = "Regulars";
        render();
      },
      async "have-form"(f, d) {
        const have = String(d.get("have") || "").trim();
        if (!have) return;
        startSuggest("have", have);
      },
      async "prefs-form"(f, d) {
        await mutate((x) => {
          x.preferences = {
            dairy: d.has("dairy"),
            avoid: d.has("avoid"),
            diet: d.get("diet"),
            exclude: String(d.get("exclude") || "").trim(),
          };
        }, "Settings saved");
      },
      async "custom-form"(f, d) {
        const label = String(d.get("item") || "").trim();
        if (!label) return;
        await mutate((x) => {
          x.custom.push({ id: uid(), label });
        }, "Added");
        render();
        core.$("#custom-form input")?.focus();
      },
    },
  };
}

// Sophia's Little World — a plain record of what she said and did, with the date and a photo.
import {
  CHAPTERS,
  DATE_RE,
  LONG_TYPES,
  MEMORY_TYPES,
  SAID,
  ageGroup,
  ageLabel,
  chapterFor,
  isoDay,
  memoryAutoTitle,
} from "./logic.js";

const TYPE_LABEL = {
  [SAID]: "She said",
  "Funny moment": "Funny",
  "A first": "A first",
  "Day out": "Day out",
  Occasion: "Occasion",
  Moment: "Moment",
  Story: "Story",
  Letter: "Letter",
};
const PROMPT = {
  "Funny moment": "What happened?",
  "A first": "What was the first?",
  "Day out": "Where did you go, and what happened?",
  Occasion: "What was the occasion, and what happened?",
  Moment: "What happened?",
  Story: "The story",
  Letter: "Your letter",
};
const PLACEHOLDER = {
  "Funny moment": "Just what happened, in a sentence or two",
  "A first": "e.g. First time she…",
  "Day out": "",
  Occasion: "",
  Moment: "Just what happened, in a sentence or two",
  Story: "",
  Letter: "Dear Sophia,",
};
const FILTERS = {
  "She said": (m) => m.type === SAID,
  Funny: (m) => m.type === "Funny moment",
  Firsts: (m) => m.type === "A first",
  "Days out": (m) => m.type === "Day out",
  Occasions: (m) => m.type === "Occasion",
  Photos: (m) => !!m.image,
  "Stories & letters": (m) => LONG_TYPES.includes(m.type),
};
const AUTHORS = ["Chloe", "John", "Both of us"];

export function createWorld(core) {
  const {
    esc,
    btn,
    empty,
    chips,
    searchbar,
    select,
    photoField,
    img,
    sample,
    visible,
    sheet,
    toast,
    render,
    mutate,
  } = core;
  const { today, dateLabel, excerpt } = core;
  const ui = core.ui;
  const w = () => core.state.world;
  const dob = () => w().profile?.dob || "";
  const find = (id) => w().items.find((m) => m.id === id);
  const newestFirst = (a, b) =>
    b.date.localeCompare(a.date) || (b.updated || "").localeCompare(a.updated || "");
  const search = (m) => core.matches(m, dateLabel(m.date) + " " + (TYPE_LABEL[m.type] || ""));
  const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return isoDay(d);
  };
  const monthLabel = (date) => dateLabel(date, { month: "long", year: "numeric" });
  const examplesNote = () =>
    core.examplesShowing()
      ? `<p class="examples-note">These are made-up examples to show how it looks. They disappear when you add your first memory.</p>`
      : "";

  // ---------- Pieces ----------

  function card(m) {
    const said = m.type === SAID && m.quote;
    const long = LONG_TYPES.includes(m.type);
    const age = ageLabel(dob(), m.date);
    const title = !m.autoTitle && m.title ? `<h3>${esc(m.title)}</h3>` : "";
    const words = said
      ? `<blockquote class="said">${esc(m.quote)}</blockquote>${m.story ? `<p class="context">${esc(excerpt(m.story, 140))}</p>` : ""}`
      : m.story
        ? `<p class="words">${esc(excerpt(m.story, long ? 160 : 320))}</p>`
        : "";
    const author = m.author && m.author !== "Example" ? `<span>${esc(m.author)}</span>` : "";
    return `<article class="memory${said ? " is-said" : ""}${long ? " is-long" : ""}"><button type="button" class="memory-open" data-open="${esc(m.id)}"><div class="memory-meta"><time datetime="${esc(m.date)}">${dateLabel(m.date, { weekday: "short", day: "numeric", month: "short" })}</time>${age ? `<span>${esc(age)}</span>` : ""}</div>${m.image ? img(m.image, excerpt(m.quote || m.story || m.title, 80), "memory-img") : ""}${title}${words}<div class="memory-foot"><span>${esc(TYPE_LABEL[m.type] || m.type)}</span>${author}${sample(m)}</div></button></article>`;
  }

  function groupsHtml(groups) {
    return groups
      .filter((g) => g.items.length)
      .map(
        (g) =>
          `${g.label ? `<h2 class="group-title"><span>${esc(g.label)}</span>${g.count ? `<small>${g.items.length}</small>` : ""}</h2>` : ""}<div class="memory-grid">${g.items.map(card).join("")}</div>`,
      )
      .join("");
  }

  const quickAdd = () =>
    `<div class="quick-add-world">${btn('<span class="q" aria-hidden="true">“</span>She said…', "add", "quick said", `data-type="${SAID}"`)}${btn("Something happened", "add", "quick", 'data-type="Moment"')}</div>`;

  function onThisDay() {
    const now = today();
    return visible(w().items)
      .filter((m) => m.date.slice(5) === now.slice(5) && m.date < now)
      .sort(newestFirst);
  }

  // ---------- Screens ----------

  function timeline() {
    const all = visible(w().items);
    let items = all.filter(search);
    if (FILTERS[ui.filter]) items = items.filter(FILTERS[ui.filter]);
    items.sort(newestFirst);
    const groups = [];
    for (const m of items) {
      const label = monthLabel(m.date);
      if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
      groups.at(-1).items.push(m);
    }
    const otd = onThisDay();
    return `${quickAdd()}${otd.length ? `<button type="button" class="otd" data-action="on-this-day"><strong>On this day</strong><span>${otd.length === 1 ? "1 memory" : `${otd.length} memories`} from ${[...new Set(otd.map((m) => m.date.slice(0, 4)))].join(", ")}</span></button>` : ""}${all.length > 3 ? searchbar("Search memories, words or months…") : ""}${chips(["All", ...Object.keys(FILTERS)])}${examplesNote()}<div id="results">${
      items.length
        ? groupsHtml(groups)
        : all.length
          ? empty("Nothing matches", "Try another word, or a different filter.")
          : empty("No memories yet", "Tap “She said…” or “Something happened” above. A sentence is plenty.")
    }</div>`;
  }

  function saidCard(m) {
    const age = ageLabel(dob(), m.date);
    return `<button type="button" class="said-card" data-open="${esc(m.id)}"><blockquote>${esc(m.quote || m.story)}</blockquote>${m.quote && m.story ? `<p class="context">${esc(m.story)}</p>` : ""}<p class="small">${dateLabel(m.date)}${age ? ` · ${esc(age)}` : ""} ${sample(m)}</p></button>`;
  }

  function saidView() {
    const all = visible(w().items).filter((m) => m.type === SAID);
    const items = all.filter(search).sort(newestFirst);
    return `<header class="day-head"><h1>Things she’s said</h1>${all.length ? `<p>${all.length} so far</p>` : ""}</header>${btn('<span class="q" aria-hidden="true">“</span>Add something she said', "add", "quick said wide", `data-type="${SAID}"`)}${all.length > 6 ? searchbar("Search her words…") : ""}${examplesNote()}<div id="results">${
      items.length
        ? `<div class="said-list">${items.map(saidCard).join("")}</div>`
        : all.length
          ? empty("Nothing matches", "Try another word.")
          : empty(
              "Nothing yet",
              "When she says something you want to keep, add it here. It takes a few seconds.",
            )
    }</div>`;
  }

  function agesView() {
    const all = visible(w().items);
    const items = all.filter(search).sort((a, b) => a.date.localeCompare(b.date));
    const d = dob();
    let groups;
    if (d) {
      groups = [];
      for (const m of items) {
        const label = ageGroup(d, m.date);
        if (groups.at(-1)?.label !== label) groups.push({ label, items: [], count: true });
        groups.at(-1).items.push(m);
      }
    } else {
      const names = [
        ...CHAPTERS,
        ...new Set(items.map((m) => m.chapter).filter((c) => c && !CHAPTERS.includes(c))),
      ];
      groups = [
        ...names.map((label) => ({ label, items: items.filter((m) => m.chapter === label), count: true })),
        { label: "Not sorted yet", items: items.filter((m) => !m.chapter), count: true },
      ];
    }
    return `<header class="day-head"><h1>By age</h1></header>${
      d
        ? ""
        : `<div class="notice">Add Sophia’s date of birth and memories sort themselves by age. <button type="button" class="textbtn" data-tab="settings">Add date of birth</button></div>`
    }${all.length > 3 ? searchbar("Search memories…") : ""}${examplesNote()}<div id="results">${items.length ? groupsHtml(groups) : empty("No memories yet", "")}</div>`;
  }

  function settings() {
    const d = dob();
    return `<header class="day-head"><h1>Settings</h1></header><section class="stack about"><h2 class="section-h">Sophia</h2><form id="profile-form" class="stack"><label class="field">Date of birth (optional)<input type="date" name="dob" value="${esc(d)}" max="${today()}"></label><p class="small">Used on this phone to show her age on each memory and to sort memories by age.</p><div class="row wrap"><button class="secondary">Save</button>${d ? btn("Remove", "clear-dob", "textbtn") : ""}</div></form></section>${core.keepingSafe()}<section class="about stack"><h2 class="section-h">Two phones</h2><p>Each memory can say whether it’s from Chloe, John or both of you. These are labels, not accounts. To bring two phones together, save a copy on one, AirDrop it to the other and choose Combine when restoring. Nothing syncs by itself, and there’s no shared access.</p></section>`;
  }

  // ---------- Viewer and editor ----------

  function detail(id) {
    const m = find(id);
    if (!m) return;
    const order = [...visible(w().items)].sort(newestFirst).map((x) => x.id);
    const at = order.indexOf(id);
    const newer = at > 0 ? order[at - 1] : "",
      older = at >= 0 ? order[at + 1] : "";
    const said = m.type === SAID && m.quote;
    const age = ageLabel(dob(), m.date);
    const by =
      m.author && m.author !== "Example"
        ? m.author === "Both of us"
          ? "From both of us"
          : `From ${m.author}`
        : "";
    sheet(
      dateLabel(m.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      `<div class="viewer reveal">${sample(m)}<p class="viewer-meta">${[TYPE_LABEL[m.type] || m.type, age, by].filter(Boolean).map(esc).join(" · ")}</p>${img(m.image, excerpt(m.quote || m.story || "", 80), "viewer-img")}${!m.autoTitle && m.title ? `<h3 class="viewer-title">${esc(m.title)}</h3>` : ""}${
        said
          ? `<blockquote class="said big">${esc(m.quote)}</blockquote>${m.story ? `<p class="context">${esc(m.story)}</p>` : ""}`
          : m.story
            ? `<p class="viewer-words${m.type === "Letter" ? " letter" : ""}">${esc(m.story)}</p>`
            : ""
      }<div class="viewer-nav">${older ? btn("‹ Older", "step", "secondary", `data-to="${esc(older)}"`) : "<span></span>"}${newer ? btn("Newer ›", "step", "secondary", `data-to="${esc(newer)}"`) : "<span></span>"}</div><div class="detail-actions">${btn("Edit", "edit", "textbtn", `data-id="${esc(id)}"`)}${btn("Delete", "delete", "textbtn danger", `data-id="${esc(id)}"`)}</div></div>`,
      "viewer-sheet",
    );
  }

  const radio = (name, value, label, current) =>
    `<label><input type="radio" name="${name}" value="${esc(value)}" ${value === current ? "checked" : ""}><span>${esc(label)}</span></label>`;

  function editor(id, opts = {}) {
    const m = find(id) || {};
    const isNew = !id;
    const type = m.type || opts.type || "Moment";
    const said = type === SAID;
    const long = LONG_TYPES.includes(type);
    const date = m.date || today();
    const author = m.author && AUTHORS.includes(m.author) ? m.author : core.meta.lastAuthor || "Chloe";
    const customTitle = m.autoTitle ? "" : m.title || "";
    const fields = `<label class="field span" id="quote-field" ${said ? "" : "hidden"}><span>What did she say?</span><textarea name="quote" rows="3" maxlength="2000" placeholder="Her exact words" ${said && isNew ? "autofocus" : ""}>${esc(m.quote || "")}</textarea></label><label class="field span"><span id="story-label">${said ? "What was going on? (optional)" : PROMPT[type]}</span><textarea name="story" rows="${said ? 2 : long ? 8 : 4}" maxlength="20000" placeholder="${esc(said ? "e.g. At bedtime" : PLACEHOLDER[type] || "")}" ${!said && isNew ? "autofocus" : ""}>${esc(m.story || "")}</textarea></label><div class="field span"><label for="m-date">When</label><div class="date-row"><input id="m-date" type="date" name="date" value="${esc(date)}" max="${today()}" required>${btn("Today", "set-date", "pill", `data-date="${today()}"`)}${btn("Yesterday", "set-date", "pill", `data-date="${yesterday()}"`)}</div><small id="age-hint">${esc(ageLabel(dob(), date))}</small></div><fieldset class="pills type-pills span"><legend>Kind of memory</legend><div>${MEMORY_TYPES.map((x) => radio("type", x, TYPE_LABEL[x], type)).join("")}</div><div class="long-types"><span class="small">Longer:</span>${LONG_TYPES.map((x) => radio("type", x, x, type)).join("")}</div></fieldset>${photoField(m)}<details class="more span" ${long || customTitle ? "open" : ""}><summary>More (optional)</summary><div class="form-grid"><label class="field span">Title<input name="title" maxlength="120" value="${esc(customTitle)}" placeholder="Leave blank and the words are used"></label>${select("author", "From", AUTHORS, author)}${dob() ? "" : select("chapter", "Chapter", [["", "Not set"], ...CHAPTERS], m.chapter || "")}</div></details>`;
    sheet(
      id ? "Edit memory" : said ? "Something she said" : "New memory",
      `<form id="edit-form" data-id="${esc(id || "")}" class="stack"><div class="form-grid">${fields}</div><p id="form-error" role="alert" class="small danger"></p><button class="primary">Save</button></form>`,
    );
  }

  /** Keeps the editor in step with the kind of memory being written. */
  function onInput(e) {
    const form = e.target.form;
    if (form?.id !== "edit-form" || ui.app !== "world") return;
    if (e.target.name === "type") {
      const type = e.target.value;
      const said = type === SAID;
      const long = LONG_TYPES.includes(type);
      form.querySelector("#quote-field").hidden = !said;
      form.querySelector("#story-label").textContent = said ? "What was going on? (optional)" : PROMPT[type];
      const story = form.querySelector('[name="story"]');
      story.placeholder = said ? "e.g. At bedtime" : PLACEHOLDER[type] || "";
      story.rows = said ? 2 : long ? 8 : 4;
      if (long) form.querySelector("details.more").open = true;
      core.modal.querySelector("#dialog-title").textContent = form.dataset.id
        ? "Edit memory"
        : said
          ? "Something she said"
          : "New memory";
    }
    if (e.target.name === "date")
      form.querySelector("#age-hint").textContent = ageLabel(dob(), e.target.value);
  }

  function prepare(entry, d) {
    entry.type = [...MEMORY_TYPES, ...LONG_TYPES].includes(entry.type) ? entry.type : "Moment";
    entry.quote = String(entry.quote || "").trim();
    entry.story = String(entry.story || "").trim();
    if (entry.type !== SAID) {
      // Switching away from "She said" keeps the words rather than dropping them.
      if (entry.quote && !entry.story) entry.story = entry.quote;
      delete entry.quote;
    } else if (!entry.quote) throw Error("Add what she said.");
    if (!entry.quote && !entry.story && !entry.image) throw Error("Add a few words or a photo.");
    if (!DATE_RE.test(entry.date || "")) throw Error("Add the date.");
    if (entry.date > today()) throw Error("That date hasn’t happened yet.");
    entry.author = AUTHORS.includes(entry.author) ? entry.author : "Chloe";
    const custom = String(entry.title || "").trim();
    entry.autoTitle = !custom;
    entry.title = custom || memoryAutoTitle(entry, dateLabel(entry.date));
    entry.chapter = dob()
      ? chapterFor(dob(), entry.date)
      : CHAPTERS.includes(entry.chapter)
        ? entry.chapter
        : "";
    if (core.meta.lastAuthor !== entry.author) {
      core.meta.lastAuthor = entry.author;
      core.saveMeta();
    }
    return entry;
  }

  return {
    tabs: [
      ["timeline", "Memories"],
      ["said", "She said"],
      ["ages", "By age"],
      ["settings", "Settings"],
    ],
    defaultTab: "timeline",
    view() {
      if (ui.tab === "settings") return settings();
      if (ui.tab === "said") return saidView();
      if (ui.tab === "ages") return agesView();
      return timeline();
    },
    detail,
    editor,
    prepare,
    onInput,
    savedMessage: () => "Saved",
    actions: {
      step: (el) => detail(el.dataset.to),
      "set-date"(el) {
        const input = core.modal.querySelector('[name="date"]');
        input.value = el.dataset.date;
        input.form.dataset.dirty = "1";
        core.modal.querySelector("#age-hint").textContent = ageLabel(dob(), el.dataset.date);
      },
      "on-this-day"() {
        const found = onThisDay();
        sheet(
          "On this day",
          found.length
            ? `<div class="memory-grid gap">${found.map(card).join("")}</div>`
            : empty("Nothing from this date yet", "Memories from today will show up here next year."),
        );
      },
      async "clear-dob"() {
        await mutate((x) => {
          x.profile = { ...(x.profile || {}), dob: "" };
        }, "Date of birth removed");
        render();
      },
    },
    forms: {
      async "profile-form"(f, d) {
        const value = String(d.get("dob") || "");
        if (value && (value > today() || !DATE_RE.test(value))) return toast("Choose a date in the past");
        await mutate(
          (x) => {
            x.profile = { ...(x.profile || {}), dob: value };
            for (const m of x.items) if (value) m.chapter = chapterFor(value, m.date) || m.chapter || "";
          },
          value ? "Saved. Ages now show on each memory." : "Saved",
        );
        render();
      },
    },
  };
}

// The Little Wishlist — save things before you forget them, find them again, and keep a record of the ones that happen.
import { WISH_KINDS, kindLabel, linkHost, rediscoverPick, shortText, tidyLink } from "./logic.js";

const KIND_KEYS = Object.keys(WISH_KINDS);
const KIND_FILTER = {
  Things: "Product",
  "Places to eat": "Restaurant",
  "Places to go": "Destination",
  "Things to do": "Experience",
  "Gift ideas": "Gift idea",
};
const FILTERS = ["All", "Favourites", "Top wishes", "Together", ...Object.keys(KIND_FILTER)];
const NONE = "__none";
const slug = (k) => (k || "idea").toLowerCase().replace(/[^a-z]+/g, "-");

export function createWish(core) {
  const { esc, btn, empty, chips, searchbar, field, area, pills, photoField, img, sample, visible } = core;
  const { sheet, closeSheet, toast, render, mutate, today, nowIso, dateLabel, money, ago } = core;
  const ui = core.ui;
  const wi = () => core.state.wish;
  const find = (id) => wi().items.find((i) => i.id === id);
  const data = (id) => `data-id="${esc(id)}"`;
  const newest = (a, b) =>
    (b.date || "").localeCompare(a.date || "") || (b.updated || "").localeCompare(a.updated || "");
  const search = (i) => core.matches(i, `${kindLabel(i.kind)} ${i.link ? linkHost(i.link) : ""}`);
  const didWord = (i) =>
    ["Product", "Gift idea"].includes(i.kind)
      ? "Got it"
      : ["Restaurant", "Destination", "Experience"].includes(i.kind)
        ? "Did it"
        : "Done";
  const doneButton = (i) =>
    ["Product", "Gift idea"].includes(i.kind)
      ? "We got it ✓"
      : ["Restaurant", "Destination", "Experience"].includes(i.kind)
        ? "We did it ✓"
        : "Got it or did it ✓";
  const examplesNote = () =>
    core.examplesShowing()
      ? `<p class="examples-note">These are made-up examples. They disappear when you save your first wish.</p>`
      : "";

  // ---------- Pieces ----------

  /** A photo-free wish still gets a proper card: its kind, its name and where the link goes. */
  const tile = (i) =>
    `<div class="wish-tile kind-${slug(i.kind)}"><span class="tile-kind">${esc(kindLabel(i.kind))}</span><span class="tile-title">${esc(i.title)}</span>${i.link ? `<span class="tile-host">${esc(linkHost(i.link))}</span>` : ""}</div>`;

  function badges(i) {
    const b = [i.priority && !i.done ? "Top wish" : "", i.together ? "Together" : ""].filter(Boolean);
    return b.length ? `<div class="badges">${b.map((x) => `<span>${x}</span>`).join("")}</div>` : "";
  }

  function card(i) {
    const facts = i.done
      ? [
          i.doneDate
            ? `${didWord(i)} ${dateLabel(i.doneDate, { day: "numeric", month: "short", year: "numeric" })}`
            : didWord(i),
        ]
      : [
          i.image && i.kind ? kindLabel(i.kind) : "",
          i.where,
          i.price ? money(i.price) : "",
          i.image && i.link ? linkHost(i.link) : "",
        ];
    const note = i.done && i.doneNote ? i.doneNote : i.notes;
    return `<article class="card wish-card${i.image ? "" : " no-photo"}"><button type="button" class="card-open" data-open="${esc(i.id)}">${i.image ? img(i.image, i.title, "wish-img") : tile(i)}${i.image ? `<h3>${esc(i.title)}</h3>` : ""}${note ? `<p class="why">${esc(shortText(note, 110))}</p>` : ""}<small>${facts.filter(Boolean).map(esc).join(" · ")}</small>${badges(i)}${sample(i)}</button>${btn(i.favourite ? "♥" : "♡", "favourite", "like", `${data(i.id)} aria-label="${i.favourite ? "Remove from" : "Add to"} favourites" aria-pressed="${!!i.favourite}"`)}</article>`;
  }

  const mini = (i) =>
    `<button type="button" class="mini" data-open="${esc(i.id)}">${i.image ? img(i.image, "", "mini-img") : `<span class="mini-img wish-tile kind-${slug(i.kind)}"></span>`}<span>${esc(shortText(i.title, 40))}</span></button>`;

  // ---------- Screens ----------

  function wishes() {
    const all = visible(wi().items);
    const open = all.filter((i) => !i.done);
    let items = open.filter(search);
    if (ui.filter === "Favourites") items = items.filter((i) => i.favourite);
    else if (ui.filter === "Top wishes") items = items.filter((i) => i.priority);
    else if (ui.filter === "Together") items = items.filter((i) => i.together);
    else if (KIND_FILTER[ui.filter]) items = items.filter((i) => i.kind === KIND_FILTER[ui.filter]);
    items.sort(newest);
    const top = open.filter((i) => i.priority).sort(newest);
    const showTop = top.length && ui.filter === "All" && !ui.query.trim();
    return `${btn("+ Save something", "add", "primary big wide")}${
      showTop
        ? `<section class="top-strip"><h2 class="section-h">Top wishes</h2><div class="strip">${top.map(mini).join("")}</div></section>`
        : ""
    }${open.length >= 3 ? btn("<strong>Something from a while ago</strong><span>Have another look at an older idea</span>", "rediscover", "rediscover") : ""}${open.length > 3 ? searchbar("Search names, notes, places…") : ""}${chips(FILTERS)}${examplesNote()}<div id="results">${
      items.length
        ? `<div class="wish-grid">${items.map(card).join("")}</div>`
        : open.length
          ? empty("Nothing matches", "Try another word or filter.")
          : empty(
              "Nothing saved yet",
              "Seen something you like? Save the link, a photo or just its name.",
              "add",
              "Save something",
            )
    }</div>`;
  }

  function collectionsView() {
    const all = visible(wi().items);
    const open = all.filter((i) => !i.done);
    const names = [...new Set(open.map((i) => i.collection).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "en-GB"),
    );
    const loose = open.filter((i) => !i.collection);
    const inside =
      ui.filter !== "All"
        ? ui.filter === NONE
          ? loose
          : open.filter((i) => i.collection === ui.filter)
        : null;
    if (inside) {
      const name = ui.filter === NONE ? "Not in a collection" : ui.filter;
      const items = inside.filter(search).sort(newest);
      return `<div class="coll-head">${btn("‹ All collections", "filter", "textbtn", 'data-value="All"')}<h1>${esc(name)}</h1>${
        ui.filter === NONE
          ? ""
          : `<div class="row wrap">${btn("Rename", "rename-coll", "secondary", `data-name="${esc(name)}"`)}${btn("Remove collection", "remove-coll", "textbtn", `data-name="${esc(name)}"`)}</div>`
      }</div>${inside.length > 6 ? searchbar("Search this collection…") : ""}<div id="results">${
        items.length
          ? `<div class="wish-grid">${items.map(card).join("")}</div>`
          : empty("Nothing here now", "Wishes move here when you give them this collection.")
      }</div>`;
    }
    const tileFor = (label, value, list) => {
      const cover = list.find((i) => i.image);
      return `<button type="button" class="collection" data-action="filter" data-value="${esc(value)}">${cover ? img(cover.image, "") : `<span class="collection-art wish-tile kind-${slug(list[0]?.kind)}"></span>`}<span class="collection-copy"><span class="collection-name">${esc(label)}</span><small>${core.plural(list.length, "wish")}</small></span></button>`;
    };
    return `<header class="day-head"><h1>Collections</h1><p>Group wishes however you like. A wish doesn’t need a collection.</p></header><div id="results">${
      names.length || loose.length
        ? `<div class="collection-grid">${names
            .map((n) =>
              tileFor(
                n,
                n,
                open.filter((i) => i.collection === n),
              ),
            )
            .join("")}${loose.length ? tileFor("Not in a collection", NONE, loose) : ""}</div>`
        : empty("No collections yet", "When you save a wish, open More and give it a collection name.")
    }</div>`;
  }

  function doneView() {
    const done = visible(wi().items)
      .filter((i) => i.done)
      .filter(search)
      .sort((a, b) => (b.doneDate || "").localeCompare(a.doneDate || ""));
    const groups = [];
    for (const i of done) {
      const label = (i.doneDate || "").slice(0, 4) || "Earlier";
      if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
      groups.at(-1).items.push(i);
    }
    return `<header class="day-head"><h1>Enjoyed</h1><p>Things you got or did, with when and how it went.</p></header>${
      done.length > 6 ? searchbar("Search…") : ""
    }<div id="results">${
      done.length
        ? groups
            .map(
              (g) =>
                `<h2 class="group-title"><span>${esc(g.label)}</span></h2><div class="wish-grid">${g.items.map(card).join("")}</div>`,
            )
            .join("")
        : empty(
            "Nothing here yet",
            "When you get or do something from your list, open it and tap “We got it” or “We did it”. It moves here with the date.",
          )
    }</div>`;
  }

  function settings() {
    return `<header class="day-head"><h1>Settings</h1></header>${core.keepingSafe()}<section class="about stack"><h2 class="section-h">Sharing gift ideas</h2><p>Not available yet. A future version could let John see the wishes you choose and quietly mark one as being bought, without you seeing which. That needs accounts and proper access controls, so nothing is shared in this version.</p></section>`;
  }

  // ---------- Detail and editor ----------

  function detail(id) {
    const i = find(id);
    if (!i) return;
    const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "");
    sheet(
      esc(i.title),
      `<div class="reveal">${sample(i)}${i.image ? img(i.image, i.title, "detail-img") : tile(i)}${i.notes ? `<p class="detail-body why-big">${esc(i.notes)}</p>` : ""}<dl class="facts">${row("What", kindLabel(i.kind))}${row("Collection", i.collection)}${row("Where", i.where)}${row("Price", i.price ? money(i.price) : "")}${row("Saved", i.date ? `${dateLabel(i.date)} (${ago(i.date)})` : "")}</dl>${
        i.link
          ? `<p class="gap"><a class="link-out" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">Open the link · ${esc(linkHost(i.link))} ↗</a></p>`
          : ""
      }${badges(i)}${
        i.done
          ? `<div class="notice done-note gap"><strong>${didWord(i)}${i.doneDate ? ` on ${dateLabel(i.doneDate)}` : ""}</strong>${i.doneNote ? `<p>${esc(i.doneNote)}</p>` : ""}</div>`
          : ""
      }<div class="detail-actions">${i.done ? btn("Move back to wishes", "undo-done", "secondary", data(id)) : btn(doneButton(i), "mark-done", "primary", data(id))}${!i.done ? btn(i.priority ? "Not a top wish" : "Make it a top wish", "priority", "secondary", data(id)) : ""}${btn(i.favourite ? "♥ Favourite" : "♡ Favourite", "favourite", "secondary", `${data(id)} aria-pressed="${!!i.favourite}"`)}</div><div class="detail-actions">${btn("Edit", "edit", "textbtn", data(id))}${btn("Delete", "delete", "textbtn danger", data(id))}</div></div>`,
    );
  }

  function editor(id) {
    const i = find(id) || {};
    const names = [
      ...new Set(
        wi()
          .items.map((x) => x.collection)
          .filter(Boolean),
      ),
    ];
    const more = !!(i.collection || i.where || i.price || i.priority || i.together);
    const fields =
      // A text box with the URL keyboard, so "etsy.com/…" is accepted and tidied rather than blocked by the browser.
      field(
        "link",
        "Link",
        i.link || "",
        "text",
        'inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Paste a link (optional)"',
      ) +
      photoField(i) +
      field(
        "title",
        "What is it?",
        i.autoTitle ? "" : i.title || "",
        "text",
        'placeholder="Optional if you’ve added a link or photo"',
      ) +
      area(
        "notes",
        "Why did you save it?",
        i.notes,
        'rows="2" placeholder="Optional. A few words to jog your memory later"',
      ) +
      pills(
        "kind",
        "What sort of thing?",
        [...KIND_KEYS.map((k) => [k, WISH_KINDS[k]]), ["", "Not sure"]],
        i.kind || "",
      ) +
      `<details class="more span" ${more ? "open" : ""}><summary>More (all optional)</summary><div class="form-grid">` +
      field(
        "collection",
        "Collection",
        i.collection || "",
        "text",
        `list="collection-names" placeholder="e.g. Home"`,
      ) +
      `<datalist id="collection-names">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>` +
      field("where", "Where", i.where || "", "text", 'placeholder="e.g. Liverpool, or the shop’s name"') +
      field("price", "Price (£)", i.price || "", "number") +
      `<label class="check span"><input name="priority" type="checkbox" ${i.priority ? "checked" : ""}>Top wish</label>` +
      `<label class="check span"><input name="together" type="checkbox" ${i.together ? "checked" : ""}>Something to do together</label>` +
      `</div></details>`;
    sheet(
      id ? "Edit" : "Save something",
      `<form id="edit-form" data-id="${esc(id || "")}" class="stack"><div class="form-grid">${fields}</div><p id="form-error" role="alert" class="small danger"></p><button class="primary">Save</button></form>`,
    );
  }

  function prepare(entry, d, existing) {
    const raw = String(entry.link || "").trim();
    entry.link = tidyLink(raw);
    if (raw && !entry.link) throw Error("That link doesn’t look right. Paste the full web address.");
    const title = String(entry.title || "").trim();
    if (!title && !entry.link && !entry.image)
      throw Error("Add a link, a photo or a few words about what it is.");
    entry.autoTitle = !title;
    entry.title = title || (entry.link ? `From ${linkHost(entry.link)}` : "Saved photo");
    entry.kind = KIND_KEYS.includes(entry.kind) ? entry.kind : "";
    for (const k of ["collection", "where", "notes"]) entry[k] = String(entry[k] || "").trim();
    const price = String(entry.price ?? "").trim();
    if (!price) delete entry.price;
    else if (!(Number(price) >= 0)) throw Error("Price should be a number, like 25 or 12.50.");
    else entry.price = price;
    entry.priority = d.has("priority");
    entry.together = d.has("together");
    entry.date = existing?.date || today();
    entry.done = !!existing?.done;
    return entry;
  }

  function rediscover(exclude = "") {
    const pick = rediscoverPick(wi().items, { exclude });
    if (!pick) return toast("Save a few things first");
    sheet(
      "From a while ago",
      `<div class="rediscover reveal">${pick.image ? img(pick.image, pick.title, "detail-img") : tile(pick)}<h3>${esc(pick.title)}</h3>${pick.notes ? `<p class="why-big">${esc(pick.notes)}</p>` : ""}<p class="small">Saved ${esc(ago(pick.date))}${pick.collection ? ` · ${esc(pick.collection)}` : ""}</p><div class="detail-actions">${btn("Still want it", "still-want", "primary", data(pick.id))}${btn(doneButton(pick), "mark-done", "secondary", data(pick.id))}${btn("Not any more", "delete", "textbtn danger", data(pick.id))}</div><p class="row wrap">${btn("Show me another", "rediscover", "textbtn", `data-exclude="${esc(pick.id)}"`)}${btn("Open it", "open-wish", "textbtn", data(pick.id))}</p></div>`,
    );
  }

  return {
    tabs: [
      ["gallery", "Wishes"],
      ["collections", "Collections"],
      ["done", "Enjoyed"],
      ["settings", "Settings"],
    ],
    defaultTab: "gallery",
    view() {
      if (ui.tab === "settings") return settings();
      if (ui.tab === "collections") return collectionsView();
      if (ui.tab === "done") return doneView();
      return wishes();
    },
    detail,
    editor,
    prepare,
    savedMessage: (i, isNew) => (isNew ? "Saved" : "Changes saved"),
    actions: {
      rediscover: (el) => rediscover(el.dataset.exclude || ""),
      "open-wish": (el) => detail(el.dataset.id),
      async "still-want"(el, i) {
        await mutate(() => {
          i.revisited = nowIso();
        }, "Kept");
        rediscover(i.id);
      },
      async priority(el, i) {
        await mutate(
          () => {
            i.priority = !i.priority;
            i.updated = nowIso();
          },
          i.priority ? "No longer a top wish" : "Now a top wish",
        );
        detail(i.id);
        render();
      },
      "mark-done"(el, i) {
        sheet(
          doneButton(i).replace(" ✓", ""),
          `<form id="done-form" data-id="${esc(i.id)}" class="stack gap"><p class="small">${esc(i.title)}</p><label class="field">When<input type="date" name="doneDate" value="${today()}" max="${today()}" required></label><label class="field">Anything to remember about it? (optional)<textarea name="doneNote" rows="3" maxlength="2000" placeholder="Where you went, what it was like"></textarea></label><button class="primary">Save</button></form>`,
        );
      },
      async "undo-done"(el, i) {
        await mutate(() => {
          i.done = false;
          i.updated = nowIso();
        }, "Back in your wishes");
        detail(i.id);
        render();
      },
      "rename-coll"(el) {
        sheet(
          "Rename collection",
          `<form id="rename-form" class="stack gap" data-name="${esc(el.dataset.name)}"><label class="field">New name<input name="name" value="${esc(el.dataset.name)}" maxlength="60" required autofocus></label><p class="small">Using the name of another collection joins the two.</p><button class="primary">Rename</button></form>`,
        );
      },
      "remove-coll"(el) {
        core.confirmSheet(
          "Remove this collection?",
          "The wishes in it stay. They just won’t be grouped any more.",
          "remove-coll-confirmed",
          "",
          "Remove collection",
        );
        core.modal.querySelector('[data-action="remove-coll-confirmed"]').dataset.name = el.dataset.name;
      },
      async "remove-coll-confirmed"(el) {
        const name = el.dataset.name;
        await mutate((x) => {
          for (const i of x.items)
            if (i.collection === name) Object.assign(i, { collection: "", updated: nowIso() });
        }, "Collection removed");
        closeSheet();
        ui.filter = "All";
        render();
      },
    },
    forms: {
      async "done-form"(f, d) {
        const i = find(f.dataset.id);
        if (!i) return;
        const when = String(d.get("doneDate") || today());
        await mutate(() => {
          i.done = true;
          i.doneDate = when > today() ? today() : when;
          i.doneNote = String(d.get("doneNote") || "").trim();
          i.updated = nowIso();
        }, "Moved to Enjoyed");
        closeSheet();
        render();
      },
      async "rename-form"(f, d) {
        const from = f.dataset.name;
        const to = String(d.get("name") || "").trim();
        if (!to) return;
        await mutate((x) => {
          for (const i of x.items)
            if (i.collection === from) Object.assign(i, { collection: to, updated: nowIso() });
        }, "Renamed");
        closeSheet();
        ui.filter = to;
        render();
      },
    },
  };
}

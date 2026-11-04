// Labelled demonstration content, seeded only when an app has no saved data yet.
// Examples are fictional. They are hidden as soon as there is real content, and can be removed in settings.
// What's for Tea? starts empty on purpose: suggestions should come from meals you actually have.

export const memories = [
  {
    id: "x1",
    type: "Something she said",
    quote: "I’m not tired, my eyes are just closing.",
    story: "At bedtime, half asleep.",
    date: "2026-11-02",
  },
  {
    id: "x2",
    type: "Something she said",
    quote: "The moon is following our car.",
    story: "On the drive home in the dark.",
    date: "2026-10-21",
  },
  {
    id: "x3",
    type: "Funny moment",
    story:
      "Put a sock on each hand and said she was a crab. Walked sideways round the living room for ten minutes.",
    date: "2026-10-09",
  },
  {
    id: "x4",
    type: "A first",
    story: "First go on the big slide at the park. Went down six times and cried when we had to leave.",
    date: "2026-09-26",
  },
  {
    id: "x6",
    type: "Moment",
    story: "Kicked every pile of leaves on the walk to the shop and made us count them. Forty-one.",
    date: "2026-10-30",
    image: "/assets/leaves.jpg",
  },
  {
    id: "x5",
    type: "Day out",
    story:
      "Beach day. Ate some sand, loved the waves, fell asleep in the car before we were out of the car park.",
    date: "2026-08-23",
    image: "/assets/coast.jpg",
  },
].map((m) => ({
  ...m,
  title: m.quote || m.story.slice(0, 60),
  autoTitle: true,
  sample: true,
  author: "Example",
}));

export const wishes = [
  {
    id: "w1",
    title: "A weekend by the sea",
    kind: "Destination",
    collection: "Trips",
    notes: "Long walks, fish and chips, no plans.",
    image: "/assets/coast.jpg",
    favourite: true,
    priority: true,
    together: true,
    date: "2026-05-01",
  },
  {
    id: "w2",
    title: "Coffee and a proper pastry",
    kind: "Restaurant",
    collection: "Places to eat",
    notes: "Walked past a new bakery café. Looked lovely inside.",
    image: "/assets/coffee.jpg",
    date: "2026-08-12",
  },
  {
    id: "w3",
    title: "Handmade plates",
    kind: "Product",
    collection: "Home",
    notes: "The speckled glaze, in the blue.",
    image: "/assets/vase.jpg",
    price: "35",
    date: "2026-09-01",
  },
  {
    id: "w4",
    title: "Learn to make fresh pasta",
    kind: "Experience",
    notes: "Saw a weekend class advertised. Could be fun together.",
    together: true,
    date: "2026-07-03",
  },
  {
    id: "w5",
    title: "Pottery class",
    kind: "Experience",
    collection: "Days together",
    notes: "With a slightly wonky mug to bring home.",
    image: "/assets/pottery.jpg",
    price: "60",
    together: true,
    date: "2026-10-10",
  },
  {
    id: "w6",
    title: "Flowers, just because",
    kind: "Gift idea",
    notes: "Loose stems, nothing too arranged.",
    image: "/assets/flowers.jpg",
    date: "2026-03-15",
  },
].map((w) => ({ ...w, sample: true, done: false }));

export const defaults = {
  tea: {
    items: [],
    plan: {},
    checked: {},
    custom: [],
    cooked: {},
    preferences: { dairy: true, exclude: "", avoid: true },
  },
  world: { items: memories },
  wish: { items: wishes },
};

// Example ids shipped by earlier versions. Untouched copies are swapped for the current examples.
export const legacyExampleIds = {
  tea: ["r1", "r2", "r3", "r4", "r5", "r6"],
  world: ["m1", "m2", "m3", "m4"],
};

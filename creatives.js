// KWBA ad creative definitions — copy drawn from the live site.
// Each creative renders across multiple platform sizes via render.mjs.
module.exports = [
  {
    id: "web-48hr",
    angle: "WEB · 48-HOUR LAUNCH",
    theme: "ink",
    eyebrow: "Web design · Milton Keynes",
    headline: "Your new website.<br><b>Live in 48 hours.</b>",
    sub: "Professional, conversion-focused sites — fixed pricing from £800. No retainers, no six-week wait.",
    badges: ["48-hour launch", "Fixed £800", "No contracts"],
    cta: "Book a free call",
    mock: "web",
  },
  {
    id: "fixed-honest",
    angle: "SIMPLE · FIXED · HONEST",
    theme: "cream",
    eyebrow: "Pricing you can trust",
    headline: "No retainers.<br>No vague quotes.<br><b>Just fixed-price growth.</b>",
    sub: "One clear plan, the price we say is the price you pay. Backed by a 30-day performance promise.",
    badges: ["Fixed pricing", "Cancel anytime", "30-day promise"],
    cta: "See our pricing",
    mock: "pricing",
  },
  {
    id: "ai-receptionist",
    angle: "AI RECEPTIONIST",
    theme: "ink",
    eyebrow: "Answers while you work · 24/7",
    headline: "Never miss<br><b>another lead.</b>",
    sub: "An AI receptionist that texts back missed calls, answers enquiries and books jobs — day and night. From £499/mo.",
    badges: ["24/7 cover", "Missed-call text-back", "From £499/mo"],
    cta: "Stop missing calls",
    mock: "chat",
  },
  {
    id: "lead-engine",
    angle: "AI LEAD ENGINE",
    theme: "ink",
    eyebrow: "We don't just build websites. We build engines.",
    headline: "More leads.<br>More calls.<br><b>More customers.</b>",
    sub: "Google Ads, landing pages and 5-day follow-up working together to bring customers in on demand. From £1,299/mo.",
    badges: ["Google Ads", "Landing pages", "5-day follow-up"],
    cta: "Start your engine",
    mock: "dashboard",
  },
  {
    id: "growth-system",
    angle: "AI GROWTH SYSTEM",
    theme: "ink",
    eyebrow: "Your complete growth system",
    headline: "Ads. SEO.<br>Retargeting.<br><b>One team.</b>",
    sub: "The full system — plus a dedicated account manager who answers to your numbers. From £2,499/mo.",
    badges: ["Full SEO", "Retargeting", "Account manager"],
    cta: "See the full system",
    mock: "dashboard",
  },
  {
    id: "local-leads",
    angle: "LOCAL LEAD GENERATION",
    theme: "cream",
    eyebrow: "Restaurants · dentists · trades",
    headline: "More leads.<br>More calls.<br><b>More customers.</b>",
    sub: "Websites and AI marketing built for local UK businesses — turn “near me” searches into booked jobs.",
    badges: ["Local SEO", "More enquiries", "Milton Keynes"],
    cta: "Get more enquiries",
    mock: "map",
  },
];

// Platform sizes to export for each creative.
module.exports.SIZES = [
  { name: "square-1080",   w: 1080, h: 1080 }, // Feed 1:1
  { name: "feed-1080x1350", w: 1080, h: 1350 }, // Feed 4:5
  { name: "pmax-1200x628",  w: 1200, h: 628  }, // PMax / landscape
  { name: "story-1080x1920",w: 1080, h: 1920 }, // Story / Reels 9:16
  { name: "wide-1920x1080", w: 1920, h: 1080 }, // YouTube / wide
];

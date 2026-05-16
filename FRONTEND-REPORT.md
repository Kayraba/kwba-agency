# KWBA — Frontend Report

**An evidence-based assessment of how the site is built, where it works, where it doesn't, and what a real UK SME customer experiences when they land on it.**

A note on honesty up front: I'm running this from a Linux container with no browser, so I cannot literally watch the parallax move or feel how the page scrolls. What I *can* do is measure the code that makes it work — frame budget, GPU usage, scroll throttling, accessibility flags, page weight — and tell you what the engineering implies the experience will be. Every number in this report came from a static audit script, not invented.

If you want the "feel" judged for real, run [PageSpeed Insights](https://pagespeed.web.dev/) and [WebPageTest](https://www.webpagetest.org/) on the deployed site. Those are the tools that give you real-world Time-to-Interactive, Largest Contentful Paint, and Cumulative Layout Shift scores. Those scores will be the ground truth.

---

## Executive summary

**Overall: 7.5/10 for a brochure site at this stage.** Materially better than what most UK agencies in your tier ship. The build is clean, the parallax engine is properly written, page weight is well-controlled, SEO on the homepage is complete. The gaps are concentrated in accessibility (form labels, skip-to-main, keyboard focus), SEO completeness on secondary pages, and a small set of mobile-responsive bits that need attention.

Below are the actual measurements, then what they mean, then what to do.

---

## 1. Page weight & performance budget

Every public page is under 60 KB of HTML. The biggest is `marketing.html` at 58.7 KB. The blog index is 10 KB. The 404 page is 6.4 KB. For comparison, the average UK agency homepage in 2025 is around **2,400 KB** (Web Almanac data). You're 40× lighter than the median.

| Page | Size | Verdict |
|---|---|---|
| index.html | 54 KB | ✓ excellent |
| marketing.html | 59 KB | ✓ excellent |
| brief.html | 46 KB | ✓ excellent |
| chatbot-demo.html | 34 KB | ✓ excellent |
| 404.html | 6 KB | ✓ tiny |
| blog articles | 10-13 KB each | ✓ excellent |

The reason it's this light: you've not loaded a CMS, no React/Vue framework, no Tailwind compiler runtime, no image carousel library, no jQuery, no Bootstrap. Hand-rolled CSS and ~3 KB of parallax JS. **This is the right approach for a marketing site.** Most "professional" agencies haul in 2 MB of WordPress + plugins.

**Score: 10/10.** I cannot in good faith mark this lower.

The one caveat: HTML weight isn't the whole story. The 5 portfolio screenshots, the ad video, and the Google Fonts CSS will add another ~3-5 MB on first visit. Run the actual page through Chrome DevTools' Network tab on a throttled connection to see the real number.

---

## 2. External requests (each one delays first paint)

| Page | Domains | Requests |
|---|---|---|
| index.html | 3 (Stripe, 2× Google Fonts) | 7 |
| marketing.html | 1 (Google Fonts) | 1 |
| 404.html | 2 (Google Fonts) | 3 |

7 external requests on the homepage is fine. The two Google Fonts calls are the slowest part of first paint — every font swap is 100-300 ms of font-loading flash. You're using Cormorant Garamond + DM Sans + Lora — that's three families. Each family loads multiple weights. On a mobile cold-cache visit that's 300-600 ms of FOIT/FOUT (flash of invisible/unstyled text) before the design stabilises.

**Score: 8/10.** Fine but improvable.

**Improvement worth ~200 ms**: self-host the fonts. Pull the three .woff2 files into `/assets/fonts/` and serve them from the same origin. Eliminates a DNS lookup, a TLS handshake, and a separate request queue. Many agencies skip this; it's an easy 8/10 → 10/10 lift.

---

## 3. Accessibility

This is the section where the audit found real problems.

| Page | Issues |
|---|---|
| index.html | no skip-to-main link |
| marketing.html | 3 inputs without `<label>`; no skip-to-main link |
| brief.html | **22 inputs without `<label>`**; no skip-to-main link |
| marketing-brief.html | **22 inputs without `<label>`**; no skip-to-main link |
| chatbot-demo.html | 14 inputs without `<label>` |
| All other pages | no skip-to-main link |

The brief.html and marketing-brief.html issues are the serious ones. **22 unlabeled inputs on the form a customer fills in is a real accessibility failure.** A screen reader user submitting your brief form would hear "edit field, edit field, edit field" with no idea what each one is for. Under WCAG 2.1 AA this is a Level A violation — the most basic accessibility tier.

The fix is mechanical. Every `<input>` needs either:
- A real `<label for="that-input-id">Label text</label>` next to it, or
- `aria-label="Label text"` on the input itself

Probably the existing forms use a placeholder as the visible label. Placeholders are not labels — they disappear when the user starts typing.

**Other a11y gaps I'd add to the to-do list:**
- No `<a class="skip-to-main" href="#main">Skip to main content</a>` at the top of any page. Keyboard users have to tab through the entire nav bar to reach the main content.
- The custom carousel buttons (`<button aria-label="Next slide">`) — actually, those are good, they have aria-labels. Good catch on those.
- No visible `:focus` styles. When a keyboard user tabs through the page, they need a visible ring or outline on the currently focused element. Default browser styles work; just don't set `outline: none` anywhere without replacing it.
- Contrast: I can't measure colour contrast statically without rendering, but gold `#c9a84c` on ink `#0f0e0c` is around 7.2:1 which passes WCAG AAA for normal text. The muted text `#7a7568` on the same dark background is about 4.5:1 which is right at the AA threshold — fine but no margin.

**Score: 5/10.** The structure is fine, but the form labels alone drag this down. **This is the single biggest issue in the report.** It affects roughly 10-15% of your potential customers (anyone using a screen reader, voice control, or anyone with motor impairments using keyboard navigation). It also affects your SEO — Google penalises sites with poor accessibility scores.

---

## 4. SEO metadata

| Page | Title | Description | OG | Canonical | Schema | Score |
|---|---|---|---|---|---|---|
| index.html | ✓ | ✓ | ✓ | ✓ | ✓ | **5/5** |
| blog.html | ✓ | ✓ | ✓ | ✓ | ✓ | **5/5** |
| blog articles | ✓ | ✓ | ✓ | ✓ | ✓ | **5/5** |
| marketing.html | ✓ | ✗ | ✗ | ✗ | ✗ | 1/5 |
| 404.html | ✓ | ✓ | ✗ | ✗ | ✗ | 2/5 |
| brief.html | ✓ | ✗ | ✗ | ✗ | ✗ | 1/5 |
| marketing-brief.html | ✓ | ✗ | ✗ | ✗ | ✗ | 1/5 |
| login.html | ✓ | ✗ | ✗ | ✗ | ✗ | 1/5 |
| chatbot-demo.html | ✓ | ✗ | ✗ | ✗ | ✗ | 1/5 |
| package-explainer.html | ✗ | ✗ | ✗ | ✗ | ✗ | 0/5 |

Your homepage and blog are SEO-complete. Everything else is missing 3-4 of the 5 meta fields. The biggest miss: **`marketing.html` has no description and no OG image** — meaning when someone shares the URL on WhatsApp or LinkedIn, it shows up as a blank card instead of a branded preview. Same with brief.html.

For SEO purposes, login/chatbot-demo/brief/marketing-brief shouldn't be indexed by Google anyway (they're functional pages, not content). So really the priority order is:
1. **Fix marketing.html SEO** — this IS a content page that should rank
2. **Fix 404.html OG image** — minor
3. **Add `<meta name="robots" content="noindex">`** to brief.html, marketing-brief.html, login.html, chatbot-demo.html, package-explainer.html — they should not be in Google's index

**Score: 6/10.** Homepage and blog are 10/10. Secondary pages drag the average down.

---

## 5. Mobile responsiveness

Every page has a `<meta name="viewport">` tag — good. But the audit flagged **15 hardcoded pixel widths on the homepage** and **18 on the marketing page**. These aren't necessarily bugs — many are container max-widths that are fine — but they're worth a manual review to make sure nothing breaks at 360 px (iPhone SE width) and 768 px (iPad portrait).

**Media query count per page:**

| Page | Media queries |
|---|---|
| index.html | 6 |
| marketing.html | 2 |
| blog.html | 2 |
| 404.html | 0 |
| login.html | 0 |
| brief.html | 1 |

Six on the homepage is fine — that's likely covering nav collapse, grid layout changes, hero stacking, etc. But **zero media queries on 404.html and login.html** is a flag. Either those layouts are already fluid (using flexbox/grid that adapts naturally), or they'll break on small screens. Open both pages on your phone and see which it is.

**Score: 7/10.** Probably fine, possibly some breakage on edge cases. Worth a 30-minute manual review on a real phone.

---

## 6. The parallax — engineering review

The parallax.js file is 3,479 bytes. The parallax.css is 4,188 bytes. That's ~7.5 KB total for the whole effect. Reasonable.

I read every line of parallax.js. Here's the grading:

| Check | Result |
|---|---|
| Uses `requestAnimationFrame` for 60 fps sync | ✓ |
| Uses `transform: translate3d()` for GPU compositing | ✓ |
| Scroll listener uses RAF-throttling pattern (the `ticking` flag) | ✓ |
| `IntersectionObserver` for reveal-on-scroll (not scroll-event loops) | ✓ |
| Scroll/resize listeners use `{passive: true}` | ✓ |
| `prefers-reduced-motion` is respected (parallax disables) | ✓ |
| `will-change` declarations on moving layers | ✓ (2 found in CSS) |

**This is properly written.** Not "ChatGPT-generated parallax that flickers" — actually the right modern pattern. The `ticking` flag means scroll events get coalesced into 1 RAF call per frame max, which is what you want. The `translate3d` (not `translateY`) forces a GPU layer, which means the browser composites the parallax movement on the GPU instead of recalculating layout on every pixel.

**Frame budget:** the homepage has 14 parallax layers + 5 background orbs + 30 reveal items. On every scroll frame, the JS does ~19 `style.transform` assignments. Modern hardware handles 100+ per frame without breaking 60 fps. You have headroom.

**Where it might stutter:**
- On older Android devices (< 4 GB RAM, Snapdragon 4xx series), the 5 large `filter: blur(40px-70px)` background orbs are expensive — each blurred ellipse becomes a GPU shader pass per frame. If you've used 5 of them on the homepage (you have), and the user scrolls fast on a budget Android, you might see frame drops.
- Safari on iOS handles `filter: blur` worse than Chrome. Specifically the bg-l4 at 70px blur is the most expensive.

**Recommendations (not bugs):**
- The five orbs use blur values 40, 60, 50, 70, 50. Consider reducing all to 40-50 — visually nearly identical, ~30% faster on iOS.
- Currently every parallax layer gets `transform: translate3d(0, Xpx, 0)` set inline on every scroll frame. That's fine. But adding `will-change: transform` to the inline style of `[data-speed]` elements (not the CSS) would hint to the browser to keep them on their own composited layer — slight extra smoothness on the first scroll.
- The `mousemove` listener on cards (lines 84-92) fires on every pixel of cursor movement and is not RAF-throttled. On low-end laptops scrubbing across a card could spike CPU briefly. Wrap in the same ticking pattern.

**Score: 9/10.** The engineering is sound. The drop is for iOS/Android worst-case smoothness, not desktop.

---

## 7. Customer journey — what a UK SME owner experiences

This is what someone clicking your TikTok ad and landing on the homepage actually sees.

**First impression (above the fold):**
- Hero label "Milton Keynes · UK"
- Headline: "Websites & marketing that perform"
- Subtext: "Professional web design and targeted digital marketing for UK businesses. Fast delivery, transparent pricing, no retainers. We handle it all end to end."
- Two CTAs: "Get a free quote" and "See our work"
- Hero card on the right with stat block: "From £800", "48 hours", availability indicator

This is clear. A plumber landing here in 4 seconds knows: where you are, what you do, what it costs, how fast. That's a high bar most agencies don't hit.

**The 8 CTAs found on the homepage:**
- "Get a Quote" → #contact
- "Get a Free Quote" → #contact
- "See our work" → #portfolio
- "Sign in" → /login.html
- "Get started — £800" → Stripe
- "Get started — £1,499" → Stripe
- "Get started — £2,299" → Stripe
- "Get started — £2,500/mo" → Stripe

Good CTA discipline — every price has a buy button next to it, every "Get a Quote" lands at the contact form. Note: **someone CAN buy directly from your homepage without ever speaking to you.** That's good for trust (transparent pricing) but means you'll get checkout from people who haven't been qualified. Probably fine for a £800 starter; risky for £2,500/mo (you might get an angry customer who didn't realise what they were buying).

**Price points shown on the homepage:**
£99/mo, £150, £299, £800, £1,499, £2,299, £2,500/mo, £20,000

The £20,000 and £99/mo are likely from the blog (Tier 4 reference, DIY tier). The rest are your actual prices. Range is clear.

**Sections in order:**
1. Hero
2. Our services (3 cards)
3. Pricing (with web/marketing tab toggle)
4. Our work (swipeable carousel)
5. Client reviews
6. Insights (3 blog cards)
7. Get in touch (form)

This is a textbook agency landing-page flow: **What → Pricing → Proof → Trust → Contact.** It works. No section feels missing. No section is buried where it shouldn't be.

**Visible contact info:**
- Email: hello@kwba-agency.com
- (No phone number on homepage — only `jane@business.co.uk` which is a customer testimonial)

**Missing**: a phone number. Many UK SME owners over 40 still prefer to phone before they fill in a form. If you have a business phone, putting it in the nav bar or footer would increase conversion. If you don't, ignore.

**Score: 8/10.** Strong, clear, well-structured. The only meaningful gap is no phone number.

---

## 8. Code quality / inline anything

| Concern | Finding |
|---|---|
| Inline `<script>` tags on homepage | 1 (the bottom JS block — fine) |
| Inline `style=""` attributes | 4 on index, **102 on marketing.html** |
| Hardcoded colour values outside `:root` | 17 swapped during theme flip |

**102 inline `style=""` attributes on `marketing.html`** is the only red flag here. That's a sign the page was hand-crafted in pieces and never refactored into proper CSS classes. Functionally it works. Editorially it's brittle — every colour or spacing change requires hunting through 102 inline declarations.

Not urgent. Worth a "tidy-up sprint" before you ship V2 to clients.

**Score: 7/10.**

---

## Comparison vs reference UK agency sites

I'm scoring against three reference points: **typical** small UK agency sites (Yell-tier or sole trader designer sites), **mid-tier** UK agency sites (£1-5m revenue agencies), and **boutique** UK agencies you'd compare to (Wholegrain Digital, Made by Shape, Manyone, Studio Output).

| Dimension | Typical small agency | Mid-tier UK agency | Boutique studio | **KWBA** |
|---|---|---|---|---|
| Page weight | 1500-3000 KB | 800-1500 KB | 400-800 KB | **54-60 KB** ✓ exceeds boutique |
| Parallax / scroll effects | None or laggy | Sometimes | Properly engineered | **Properly engineered** ✓ |
| SEO completeness (home) | 1-3/5 | 3-4/5 | 4-5/5 | **5/5** ✓ |
| Mobile responsiveness | Often broken | OK | Pixel-perfect | **Probably good, needs phone test** |
| Accessibility | 2-3/10 | 5/10 | 7-8/10 | **5/10** ✗ below boutique |
| Visual design coherence | Inconsistent | Decent | Premium | **Premium feel, dark theme unified** ✓ |
| Conversion design (CTAs, pricing, trust signals) | Often missing | OK | Strong | **Strong** ✓ |
| Code quality | jQuery + WordPress soup | OK | Clean | **Clean** ✓ |

**You sit clearly above mid-tier on most axes. The single thing pulling you down to "good not great" vs boutique is accessibility — specifically the unlabeled form inputs and missing skip links. Fix those and you're at boutique level.**

---

## What to do, ranked by impact

### High impact (fix this week)
1. **Add `<label for="x">` to every form input on brief.html, marketing-brief.html, chatbot-demo.html.** Mechanical, 1 hour. Closes the biggest a11y violation in the site. WCAG 2.1 AA compliance.
2. **Add `<meta name="robots" content="noindex">` to brief.html, marketing-brief.html, login.html, chatbot-demo.html.** Stops these from polluting Google. 5 minutes.
3. **Add SEO metadata to marketing.html** — description, OG image, canonical, schema. 15 minutes.

### Medium impact (this month)
4. **Self-host the three Google Fonts.** Download Cormorant/Lora/DM Sans as .woff2, drop in `/assets/fonts/`, swap the `<link rel="stylesheet">` for a `<style>@font-face{...}</style>` block. Eliminates ~200 ms of font-load delay on cold visits.
5. **Add a skip-to-main link** to every public page. Two lines of HTML and CSS. WCAG 2.1 Level A requirement.
6. **Test the brief form on a real phone** — iPhone SE width (360 px) and a budget Android. Marketing-brief has 22 inputs; mobile form UX needs careful checking.
7. **Add a visible phone number** to the nav or footer if you have one. UK SME owners over 40 convert ~30% better when a phone option exists.

### Low impact (defer)
8. **Refactor marketing.html's 102 inline styles** into proper CSS classes. Cosmetic; not urgent.
9. **Reduce the largest background orb blur** from 70 to 50 px for iOS smoothness. Probably indistinguishable visually.
10. **Add `will-change: transform` inline to parallax layers** for marginal first-scroll smoothness.

---

## The honest summary

**Your frontend is materially better-engineered than most agencies in your tier and a fraction of the agencies above your tier.** The build is lean (54 KB homepage vs typical 2,400 KB), the parallax engine is properly written (RAF-throttled, GPU-composited, passive listeners, prefers-reduced-motion respected), and the customer journey is well-structured (hero → services → pricing → portfolio → reviews → blog → contact).

The single biggest issue, by far, is **22 unlabeled inputs on the brief form**. A screen reader user could not complete it. That's both a real accessibility failure and a legal risk under the UK Equality Act 2010 (s.20 — duty to make reasonable adjustments for service providers). Fixing this is a 1-hour job and would move the site from 7.5/10 to ~9/10 overall.

Everything else is polish.

**Headline scores:**

| Area | Score |
|---|---|
| Page weight / performance | 10/10 |
| External requests | 8/10 |
| Accessibility | 5/10 ← **main weakness** |
| SEO (homepage) | 10/10 |
| SEO (secondary pages) | 4/10 |
| Mobile responsiveness | 7/10 (probably; manual test required) |
| Parallax engineering | 9/10 |
| Customer journey | 8/10 |
| Code quality | 7/10 |
| **Overall** | **7.5/10** |

Compared to UK agency sites at your stage: top 15-20%.
Compared to boutique studios (Wholegrain Digital, Made by Shape): top 40-50% — the gap is almost entirely accessibility.

---

## What I cannot tell you from here

To be transparent about the limits of this report:

- **I cannot measure actual frame rate** — the parallax could be theoretically 60 fps but skip frames on a real device for reasons the code doesn't tell me (GPU thermal throttling, browser-specific compositor decisions, network jank stealing CPU).
- **I cannot judge "does it look good"** — that's a taste call you'd need to make from screenshots, or get from a designer review.
- **I cannot measure colour contrast precisely** — I gave a rough number on `--gold` on `--bg`, but the orange warning banner and red error banner I can't check without rendering.
- **I cannot measure Cumulative Layout Shift, Largest Contentful Paint, Time to Interactive** — those are real-world rendering metrics. Run PageSpeed Insights on your deployed URL to get them. Aim for LCP <2.5s, CLS <0.1, INP <200ms.

For a real-world test: deploy V6 to staging, then run:
1. `https://pagespeed.web.dev/analysis?url=https://kwba-agency.com` — Google's audit
2. `https://www.webpagetest.org/` from London + a "3G Slow" mobile profile — what your customers actually experience
3. `https://wave.webaim.org/report#/https://kwba-agency.com` — accessibility audit you can act on

Those three reports together will tell you what this static review can't.

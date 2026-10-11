# Lead Engine marketing site

The homepage and contact page focus on one offer: enquiry handling and follow-up
for UK trades and service businesses. The primary action is **Book a Free Demo**.
It submits a demo request; the team must arrange an appointment by email.

## Files

- `public/index.html`: positioning, workflow, sample demo, enquiry-value calculator,
  pilot pricing, measurement plan, FAQs, about and request form.
- `public/contact.html`: dedicated demo request page, also used by existing links.
- `public/assets/lead-engine.css`: shared responsive styles with reduced-motion support.
- `public/assets/lead-engine.js`: navigation, demo, calculator, form and analytics hooks.
- `public/assets/api-config.js`: existing API origin configuration, reused unchanged.

The Express server, admin, client portal, chatbot, prospector and legacy service
pages keep their existing URLs. The homepage no longer promotes platform builds,
web design or multiple services. The public pages use system fonts and local
assets, with no new browser libraries or build step.

## Request handling

The form posts JSON to the existing `/public-brief` endpoint. It sends both
`contactEmail` and `cEmail` for compatibility with validation, admin views and
notification emails. `briefType` is `lead-engine-demo`; `service` is
`KWBA Lead Engine`. A successful response must contain an integer record ID.
Only then does the UI confirm receipt and emit `contact_submitted`.

Failed requests retain the entered values. A timeout warns that the request may
have arrived. Duplicate clicks are disabled while sending. No request is sent to
Formspree by these pages. With JavaScript disabled, an email link is provided.

## Demo and calculator

The interactive demo is a labelled, scripted sample with plumbing, electrical and
roofing scenarios. It does not call an AI provider, send SMS/email, create leads
or reserve appointments. Production channel connections require an agreed setup.

The calculator estimates potential monthly job value using:

`enquiries × missed percentage / 100 × conversion percentage / 100 × job value`

This is potential revenue before costs, not profit or guaranteed recovered revenue.
All inputs have bounds, including percentages from 0 to 100.

## Analytics

Subscribe to `window` events named `kwba:analytics`, or set
`window.kwbaAnalytics = event => { ... }` before the page script loads.
No provider, cookies, network tracking or persistent visitor storage is added.
Events contain `name`, `properties` and `timestamp`; no form values are included.

Events: `hero_demo_click`, `nav_demo_click`, `pricing_demo_click`,
`mobile_demo_click`, `demo_started`, `demo_completed`, `pricing_viewed`,
`results_viewed`, `roi_calculated`, `contact_started`, `contact_submitted`.
Demo events identify the selected sample scenario. Submission events identify
the homepage or contact page. Connect a provider if reporting is needed.

## Before offering a live pilot

- Confirm the indicative £299/month starting price, setup fee, usage costs,
  VAT treatment and contract terms in each quote.
- Confirm supported channels, providers, handover rules and data arrangements.
- Verify the deployed API origin, CORS allow-list and database configuration.
- Configure SMTP/admin notifications so demo requests reach the team by email;
  requests are still visible in the admin database if SMTP is absent.
- Agree measurable pilot outcomes. Publish real case studies only with consent.

No fabricated testimonials, performance metrics or integration logos are included.
The measurement section is ready to be replaced with verified pilot results.

## Verification

There is no frontend compilation step. Run `npm ci`, `npm test`,
`node --check public/assets/lead-engine.js` and
`npm audit --omit=dev --audit-level=high`.

Browser verification covers desktop/mobile overflow, keyboard navigation, all
sample scenarios, calculator normal/zero/invalid inputs, failed and unconfirmed
form responses, successful saves in the admin pipeline, event payloads and the
no-JavaScript email fallback. Live SMTP delivery and customer integrations require
their production credentials and are not exercised by local checks.

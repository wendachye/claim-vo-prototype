# Claim & VO prototype

A frontend-only construction workflow demo built with Next.js and React. It includes project workspaces, contract review, completion tracking, mock WhatsApp processing, QS variation review and monthly claim preparation with saved assessment preview/export.

All seeded projects, parties, schedule values, site activity and approvals are fictional. Generated photos illustrate the workflow; they are not evidence from an actual project. No uploaded contract pages, commercial records or drawings are included.

## Run

Use Node.js **22.12+** and npm.

```bash
npm install
npm run dev
```

Open the address printed by Next.js (normally http://localhost:3000). The project dropdown applies to every module:

- `#projects` — create and select project workspaces
- `#contract` — review illustrative schedule values and confirm a baseline
- `#completion` — review cumulative reported and verified physical progress
- `#whatsapp` — process mock worker messages and generated photos
- `#vo` — assess flagged extra work and track local approval decisions
- `#claims` — prepare monthly assessments from verified work and approved VOs
- `#claim-preview?draft=…` — preview a saved revision, download CSV or print/save PDF

## Demo walkthrough

1. Select **Campus Scaffold (Demo)**. Review WI-001's simulated extraction mismatch: 2,800 m² was read; the fictional reference is 2,000 m². Confirm the item and baseline.
2. In **WhatsApp processing**, process the WI-001 photo update. Reported completion changes to 65%; verified completion stays at 25% until reviewed. Cumulative percentages replace the total. Replaying an event creates no duplicate report.
3. Process an extra-work message. In **VO review**, inspect the evidence, record a scope assessment and instruction reference, then track approval. Decisions retain their history.
4. In **Monthly claims**, choose a month and enter QS-assessed cumulative quantities and VO values. Review prior claimed values, confirm any undated evidence as of the cutoff, save a revision and mark a valid draft prepared. Prepared drafts do not become prior claimed values. Open **Preview & export** from Saved drafts to read the frozen revision, download its CSV or use Print / Save PDF.
5. Switch to **Warehouse Extension (Demo)**. Its schedule, activity, VO reviews and claim drafts remain separate. New projects start empty.

## Checks

```bash
npm run build
npm run test:projects
npm run test:whatsapp
npm run test:vo
npm run test:claims
npm run test:claim-pack
npm run preview
```

The normal build uses `.next`; `npm start` runs production and `npm run preview` uses port 4173. Optional Sites packaging remains available with `npm run build:sites`, followed by `npm run test:sites`. That produces `dist/client`, `dist/server/index.js` and `dist/.openai/hosting.json`.

## Vercel

Import this repository using the **Next.js** framework preset and the repository root. Keep default install/build settings and leave the output-directory override blank. No environment variables are required. Existing hash links and browser-local storage remain supported; another domain has separate demo storage.

## Limits

- Backend, production authentication, live WhatsApp and AI extraction are future work. Message interpretation uses predefined fixtures. Uploading a PDF opens a local preview and does not replace the seeded schedule.
- Browser storage retains changes on the same origin; it provides no server sync or durable audit service. Reset restores only the selected project's seed.
- Physical completion does not automatically establish a claim amount. QS assessments require explicit quantities and values; bundled scaffold rates must not be multiplied by duration as a billing rule.
- VO approvals and prepared claims are local demonstrations. They do not submit a claim, certify payment, change contract totals or establish previous claimed amounts. Claim values and evidence remain frozen, and changed sources require a new revision. New revisions also capture project/contract details; legacy revisions label their current-details fallback. Exports are read-only assessments with incomplete values left unknown. CSV includes evidence references; photos appear in the preview/PDF.

Generated photo files and prompts are documented in [public/assets/DEMO-PHOTOS.md](public/assets/DEMO-PHOTOS.md).

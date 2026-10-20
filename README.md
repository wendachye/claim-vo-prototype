# Claim & VO prototype

A frontend-only construction workflow demo built with Next.js and React. It includes project workspaces, contract review, completion tracking, mock WhatsApp processing, QS variation review and monthly claim preparation with saved assessment preview/export.

All seeded projects, parties, schedule values, site activity and approvals are fictional. Generated photos illustrate the workflow; they are not evidence from an actual project. No uploaded contract pages, commercial records or drawings are included.

## Simple workflow

Start on **Project overview** for the selected project's next action. The visible sequence is **Contract → Site updates → Extra work → Claims**. The top project dropdown stays available from every module.

- **Contract:** check the work list, then confirm it. A confirmed contract offers **Continue to site updates**.
- **Site updates:** review messages and photos, then use **Progress** to verify completion. New messages appear first. Small screens show reported and verified totals together in cards.
- **Extra work:** review the evidence and instruction, then track approval. The approved record links to monthly claims; approval never inserts a claim value automatically.
- **Claims:** saved claims appear first. **Start claim** guides **Choose work → Enter totals → Review**. Use **Other work claimed before?** to reconcile prior amounts for work that is no longer eligible. Positive prior amounts cannot be omitted. Unfinished edits remain while browsing; save explicitly before refreshing. Saved revisions retain their snapshots.

History, message details and older claim versions are expandable. This remains a browser-local demo with no live AI, WhatsApp or external submission.

## UI conventions

Page headers, destination-labelled back links, form fields and action rows use shared components in `src/components/ui.jsx` and the common sizing/spacing rules in `layout-system.css`. Return links sit above detail titles; wizard step-back actions stay at the lower left. Inputs, labels, optional/unit markers, hints, validation errors and attachment buttons share one control scale. Modal close controls and the printed claim document retain their existing behavior.

## Run

Use Node.js **22.12+** and npm.

```bash
npm install
npm run dev
```

Open the address printed by Next.js (normally http://localhost:3000). The project dropdown applies to every module:

- `#projects` — selected-project overview and next action; open All projects for management
- `#contract` — review illustrative schedule values and confirm a baseline
- `#completion` — review cumulative reported and verified physical progress
- `#whatsapp` — Site updates: review mock worker messages and generated photos
- `#vo` — Extra work: assess flags and track local approval decisions
- `#claims` — saved claims and guided preparation from verified work and approved VOs
- `#claim-preview?draft=…` — preview a saved revision, download CSV or print/save PDF

## Demo walkthrough

1. Select **Campus Scaffold (Demo)**. Review WI-001's simulated extraction mismatch: 2,800 m² was read; the fictional reference is 2,000 m². Confirm the item and baseline.
2. In **WhatsApp processing**, process the WI-001 photo update. Reported completion changes to 65%; verified completion stays at 25% until reviewed. Cumulative percentages replace the total. Replaying an event creates no duplicate report.
3. Process an extra-work message. In **VO review**, inspect the evidence, record a scope assessment and instruction reference, then track approval. Decisions retain their history.
4. In **Monthly claims**, choose a month and enter QS-assessed cumulative quantities and VO values. Review prior claimed values, confirm any undated evidence as of the cutoff, save a revision and mark a valid draft prepared. Prepared drafts do not become prior claimed values. Open **Preview & export** from Saved drafts to read the frozen revision, download its CSV or use Print / Save PDF.
5. Switch to **Warehouse Extension (Demo)**. Its schedule, activity, VO reviews and claim drafts remain separate. New projects offer a fictional warehouse sample or an empty register for mock contract upload.

## Checks

```bash
npm run build
npm run test:projects
npm run test:whatsapp
npm run test:vo
npm run test:claims
npm run test:claim-pack
npm run test:workflow
npm run test:contract-import
npm run preview
```

The normal build uses `.next`; `npm start` runs production and `npm run preview` uses port 4173. Optional Sites packaging remains available with `npm run build:sites`, followed by `npm run test:sites`. That produces `dist/client`, `dist/server/index.js` and `dist/.openai/hosting.json`.

## Vercel

Import this repository using the **Next.js** framework preset and the repository root. Keep default install/build settings and leave the output-directory override blank. No environment variables are required. Existing hash links and browser-local storage remain supported; another domain has separate demo storage.

## Limits

- Backend, production authentication, live WhatsApp and AI extraction are future work. Message interpretation uses predefined fixtures. PDF selection is local; mock extraction uses a preset fictional work list and never replaces existing project records.
- Browser storage retains changes on the same origin; it provides no server sync or durable audit service. Reset restores only the selected project's seed.
- Physical completion does not automatically establish a claim amount. QS assessments require explicit quantities and values; bundled scaffold rates must not be multiplied by duration as a billing rule.
- VO approvals and prepared claims are local demonstrations. They do not submit a claim, certify payment, change contract totals or establish previous claimed amounts. Claim values and evidence remain frozen, and changed sources require a new revision. New revisions also capture project/contract details; legacy revisions label their current-details fallback. Exports are read-only assessments with incomplete values left unknown. CSV includes evidence references; photos appear in the preview/PDF.

Generated photo files and prompts are documented in [public/assets/DEMO-PHOTOS.md](public/assets/DEMO-PHOTOS.md).

## Mock contract upload

1. Open **Contract → Upload contract**. Choose a local PDF up to 30 MB, or **Use demo PDF**.
2. Select **Start demo extraction**. The short simulation can be canceled without changing project data.
3. Review six preset items and the flagged quantity. **Review work list** opens the matching fictional PDF beside the editable fields.
4. Correct WI-001 from **1,320** to the source value **1,200 m²**, confirm the item, then confirm the work list before site verification.

The work list uses the bundled fictional warehouse source in SGD. Selected PDF contents are not parsed. File bytes stay out of saved project data; a selected-file preview is available for the current session only. The bundled PDF remains available after reload. Empty projects receive the sample list in place; projects with existing work open the result in a new demo project. Existing edits, baselines and claims are preserved.

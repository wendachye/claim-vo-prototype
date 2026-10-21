# Claim & VO prototype

A frontend-only construction workflow demo built with Next.js and React. It includes project workspaces, contract review, completion tracking, mock WhatsApp processing, QS variation review and monthly claim preparation with saved assessment preview/export.

The default campus and warehouse projects are fictional. A separate, explicitly requested **Original S.I.T. contract** scenario uses the supplied contract metadata, 18 reviewed schedule rows and two source-page images. All site activity, people, progress, generated photos, VO decisions and claim assessments remain simulated. The complete original PDF is not bundled.

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

The PDF uses a compact A4 landscape print layout with a white page background, repeating table headers and evidence cards that flow between pages. Every page includes the saved project name and claim month in its top margin, plus the saved claim reference and **Page X of Y** in its bottom margin. Use a current Chrome or Edge browser to save the PDF, and turn off the browser's own **Headers and footers** option to avoid duplicate browser details. It retains full messages, photos and recorded approval details from the saved revision. Generated photos are labelled as demo images.

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

## Drawing and area mapping

Open **Contract → Drawing & areas**, then **Use demo drawing** or select a local PDF/image. Choose an area, link its contract work items and **Save area**. Add your own area codes as needed. Image plans support pins; PDF references use an area name and page. Mapping is manual and does not measure work.

Saved links appear in the contract work list, site-message review and Progress. A message naming a work item that conflicts with its area link is held for clarification. A map never turns an unclear message into automatic completion. Existing report evidence, baselines and claim snapshots remain unchanged.

Drawing metadata and saved areas stay in browser storage. Custom file previews last for the current session; choose the same file again to restore a preview without replacing links. The bundled fictional plan remains available after reload. Replacing a drawing retains area names/links but clears pin positions for review. Reset clears only the selected project's drawing and mappings.

## Completion on the drawing

Open **Contract → Drawing & areas** to see Not started, In progress and Completed colours from linked work items. **Verified** shows supervisor-checked totals; **Reported** shows worker updates. Select an area and choose **View in Progress** to open just its linked items. Verify a pending report there and return to the drawing to see the status change.

Statuses refer to each linked work item as a whole, not measured quantities within an area. Multiple items are summarized by counts, without averaging their percentages. Unlinked areas and missing progress are shown separately.

**Try completion demo** opens a separate fictional project containing all three completion states and a pending report for review. Existing projects are preserved. No backend or live AI is connected.

## Area messages and site photos

Select a pin or area in **Drawing & areas** to see **Site updates & photos** beneath its completion details. The cards show the original message, sender, date, review status and attached photo. Click a photo to enlarge it. Recent updates appear first; longer histories can be expanded.

**Open original update** opens the exact mock WhatsApp message, with **Back to drawing** to return to the area. Older report-only records offer **Review site report**. Viewing cards or photos leaves progress, VO decisions and claims unchanged. Saved reports and their inbox copies appear once, and old saved area references remain attached after mapping edits.

New projects created through **Try completion demo** include mock progress and extra-work messages with review examples. Existing projects keep their saved records. Photos are clearly labelled demonstration images; no live WhatsApp or backend service is connected.

## Extra-work flags on the drawing

Amber flags identify areas with VO cases to review. A separate **✓ VO** marker means extra work has a recorded approval; the area's completion colour still shows physical progress. Select the area, then **Review VO** to open the exact case. **Back to drawing** returns to that area, and saved review decisions update the marker. Rejected cases stay under rejected history.

New extra-work messages can also appear as hints with **See message**. They become VO cases only after explicitly flagging them in Site updates. Opening a map or review does not process messages, approve work, update completion or create a claim.

The latest **Try completion demo** creates a separate fictional project with an Area A2 flagged case, an Area B2 mock approval and an Area A1 rejected case, while preserving existing projects. All decisions stay in this browser.

## Contract scenario walkthrough

Open **All projects → New project → Sample campus contract — realistic scenario**. The new project starts with 18 fictional campus scaffold rows, a matching illustrative W3/W5 plan, a checked mock work list and a complete site-to-claim scenario. Existing projects and edits stay intact.

Explore the drawing to see verified, pending and not-started work, related messages/photos, an extra-work scope query, a fictional approval and an included-scope rejection. The overview offers **Explore the drawing**, **View example claim** and a short walkthrough. All parties, values, activity, approvals and area pins are demonstration data.

The example claim is a saved draft using explicitly mocked QS inputs, separate from physical percentages. It shows gross values before retention, GST or other deductions; nothing is submitted, certified or paid. **Reset demo** restores the selected project's seeded workflow and clears its drawing mappings, following the existing reset behavior.

The fictional campus fixture and plan remain available alongside the source-backed S.I.T. option. Browser-local projects and existing edits are never copied into a new demo. Run `npm run test:provided-demo` to check the fictional scenario.

## Original S.I.T. contract scenario

Open **All projects → New project → Original S.I.T. contract — realistic scenario**. The form suggests an independent **SIT-DEMO01** code (or the next unused code), preserving existing campus, warehouse and original-demo projects. Create the project, then use **Explore the drawing** or **View example claim** from its overview.

The contract identity, parties, original rates, source quantities and source dates come from the supplied S.I.T. scaffolding schedule. The 18 rows are a representative subset, not the full contract schedule. **Compare with contract** displays the source schedule; **Drawing & areas** displays the supplied site plan with illustrative W3/W5 links. The two images persist across refreshes without a database or file upload.

When the app loads, existing original S.I.T. demos automatically receive the matching generated message photos, including inactive projects. Only recognized bundled illustrations and consistent paired reports are refreshed; prior photos remain in **Earlier demo illustrations**. Uploaded attachments, changed scopes or mismatched evidence are retained. Progress, VO decisions, baseline and reset data, and saved claim revisions stay unchanged. Reloading again does not repeat the update or add duplicate history.

Saved claims and exports keep the evidence captured in that revision. If refreshed report evidence differs from an unprepared saved draft, the existing source-change check still requires reviewing and saving a new revision before preparation; the photo refresh does not rewrite or automatically prepare claims.

The scenario includes a newer 65% worker report against 50% verified work, completed and not-started items, an unclear incremental message, an additional-platform scope query and explicitly simulated approval/rejection examples. The saved claim uses separately specified mock QS inputs and remains an unsubmitted gross draft before retention, GST and deductions. No source percentage automatically creates claim money.

This source profile is intended for the user-requested deployed showcase. Deploying it makes the included real contract metadata, prices and two source images accessible with the app. The full original PDF and other uploaded documents are excluded. Run `node --test tests/sit-contract-demo.test.mjs tests/source-documents.test.mjs` for source integrity, project isolation, preview resolution and saved-evidence checks.

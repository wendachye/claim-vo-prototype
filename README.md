# Claim & VO prototype

A frontend-only construction workflow demo built with Next.js, React and TypeScript. It includes project workspaces, contract review, completion tracking, mock WhatsApp processing, QS variation review and monthly claim preparation with saved assessment preview/export.

The default campus and warehouse projects are fictional. A separate, explicitly requested **Original S.I.T. contract** scenario uses the supplied contract metadata, 18 reviewed schedule rows and two source-page images. All site activity, people, progress, generated photos, VO decisions and claim assessments remain simulated. The complete original PDF is not bundled.

## Simple workflow

Start on **Dashboard** for the selected project's claim and VO summaries. Open **Contract**, **Site updates**, **Extra work** or **Monthly claims** from the sidebar. The top project dropdown stays available from every module. Form and filter dropdowns use shadcn Select, action menus use shadcn DropdownMenu, and the searchable project picker retains its shadcn Popover.

Use the **notification bell** at the top right of any module to see the selected project's outstanding site messages, latest progress reviews, open VOs and saved claim actions across months. The popup previews three tasks as simple clickable rows; View all reveals the remaining tasks. Rows show a short action and area or claim month/version, and open the exact message, report, VO case or claim version. Links opened here provide **Back to dashboard**. The list derives from current saved statuses: viewing a record leaves it pending; verification, VO decisions and claim tracking update or remove its task automatically. Submitted revisions replace their original query task, and part-paid claims remain pending until fully paid. This is a browser-local mock workflow; opening tasks never changes saved claim values.

- **Contract:** check the work list, then confirm it. Open Site updates from the sidebar when needed.
- **Site updates:** review messages and photos, then use **Progress** to verify completion. New messages appear first. Small screens show reported and verified totals together in cards.
- **Extra work:** check contract scope, instruction evidence, price approval and claim eligibility separately. Price approval does not verify the work or select it in a claim.
- **Claims:** saved claims appear first. **Start claim** guides **Choose work → Enter totals → Review**. Use **Other work claimed before?** to reconcile prior amounts for work that is no longer eligible. Positive prior amounts cannot be omitted. Unfinished edits remain while browsing; save explicitly before refreshing. Saved revisions retain their snapshots.

VO reviews marked **Price approved** still need an explicit claim check. Existing browser approvals are not automatically made eligible: document the instruction, record the extra-work verification reference and explain the QS decision. **Save claim checks** preserves the original evidence and price approval. Pending checks remain in Needs attention; an explicit exclusion closes that follow-up. Eligible work is offered for QS assessment only when its approval, verification and review dates meet the claim cutoff. Existing saved claims keep their original values and evidence; changed supporting checks require a new unissued revision. Fresh contract demos include clearly fictional completed checks for their example VO.

History, message details and older claim versions are expandable. This remains a browser-local demo with no live AI, WhatsApp or external submission.

Within a VO's **Price approval**, expand **Customer confirmation**. Use a fictional demo contact, **Preview request**, then **Save mock request** to freeze the recipient, authority, scope and proposed price. Simulate **Scope acknowledged**, **Price approved** or **Changes requested** and explicitly **Save mock reply**. These records do not approve the VO. A current price-approved reply offers **Use reply in approval form**; check those fields and use the existing **Record approval** action. Keep or reset any entered approval fields before copying a reply. Work verification and claim eligibility remain separate.

Request versions and original replies remain in history after scope/price changes or reopening. Changed requests need a new version; an unknown price cannot receive a price-approved reply, while zero is valid. The existing VO attention task follows the current request/reply without duplicating tasks. Unfinished confirmation and QS fields remain separate while browsing; save before refreshing. Requests and replies stay in this browser, send nothing, and never change saved claim versions or exports.

Use **Extra work → Add extra work** to record a manual instruction for the selected project. Enter a short work description and original details, with an optional site area/location, reported instruction reference, contract comparison link and bundled demo photo. **Add for review** opens the exact new case in the existing scope, instruction, price and claim checks. Manual entries are labelled separately from WhatsApp evidence; prices start unknown and creation does not change progress or saved claims. Original notes, author/time and attachment stay with the case. Unfinished entries remain separate by project while browsing; save before refreshing. Only explicitly selected mapped areas receive the new case's drawing flag.

**Contract** starts with a compact status/value header and a five-column work list. A visible filter bar contains **Search**, **Location** and **Review status**, using the existing Mighty One styling and shadcn Select controls. Selections apply immediately; **Clear all** appears only while search or filters are active and returns focus to Search. On narrow layouts, Search sits above the two dropdowns. Empty results keep the same controls and one reset action available. Unresolved items retain a visible **Needs review** shortcut. Open **Review/View** for the original source beside the **From contract / Work-list value** comparison. Exact area and site-update links are in the item’s **Related records**. **Export CSV**, versions and revisions remain under **Contract actions**. No values are saved just by browsing or filling from the source.

In **Contract → Contract actions**, choose **Edit contract**, record a short change reason and create an editable version. Review and confirm changed items, then explicitly **Confirm work list**. **Contract versions** shows a compact list with the reason, reviewer/date and expandable old-versus-new values for changed contract fields. Progress updates are not contract changes. Missing legacy details or comparison snapshots stay unrecorded; original source rows, prior baselines and saved claim values/evidence remain unchanged. The reason form stays separate by project/version while browsing; save before refreshing.

Before confirmation, use the compact checks status—such as **1 item needs review**, **Total needs review** or **No issues found**—to open missing values, unreviewed extraction and quantity × rate differences. After confirmation, open **Contract actions → Contract checks** for the same read-only details; the inline section is hidden. Opening checks does not save or confirm anything. Each issue opens its exact item. Correct and save the values before confirming a new baseline; unfinished edits still require saving separately. Totals include measured rows only, keep unknown values distinct from zero, and compare the saved work-list value with the declared contract value without adjusting either. S.I.T. is labelled **Partial schedule**: its 18 selected rows are not expected to equal the full contract sum. **Review total difference** opens a short QS reason form when a full schedule has a known difference. Save the reason before confirming; the amounts stay unchanged. The recorded reason, reviewer, time and compared values stay with that exact contract version and appear in **Contract versions**. Changed contract values require a new review; partial S.I.T. schedules require no such reason. Unfinished reasons stay separate by project and saved contract values while browsing; save before refreshing. Existing confirmed versions and saved claims remain unchanged.

## UI conventions

Page headers, destination-labelled back links, form fields and action rows use shared components in `src/components/ui.tsx` and the common sizing/spacing rules in `layout-system.css`. Return links sit above detail titles; wizard step-back actions stay at the lower left. Inputs, labels, optional/unit markers, hints, validation errors and attachment buttons share one control scale. Modal close controls and the printed claim document retain their existing behavior.

## Move drawing pins

On image drawings, drag an existing area pin to preview a new location. A short click still selects the area. Dragging opens its area editor after the drop; choose **Save area links** to confirm. Moving a pin preserves the other unfinished area fields and never changes reported/verified progress, VO decisions or saved claims. Escape cancels an active drag, and unsaved positions stay separate by project/drawing/area while browsing. The original click-to-place and manual percentage fields remain available; PDF areas continue to use names and pages.

For keyboard use, focus the pin, press Space, move with the arrow keys, then press Space to drop or Escape to cancel. Positions remain relative to the drawing when zooming or scrolling.

## TypeScript

All application screens, shared components, form buffers, mock state and business logic under `src/` use strict TypeScript. Shared domain models describe projects, work items, drawing areas, messages, VO reviews and frozen claim snapshots. Run `npm run typecheck` before the normal production build; type errors are not ignored. Tests and build/hosting scripts retain their existing JavaScript tooling.

## Run

Use Node.js **22.18+** (or Node.js 24) and npm. The native state tests use Node’s built-in TypeScript support.

```bash
npm install
npm run dev
```

Open the address printed by Next.js (normally http://localhost:3000). The project dropdown applies to every module:

- `#dashboard` — default landing page with selected-project claim and VO summaries
- `#projects?manage=1` — All projects; choose a project or create one
- `#projects` and `#overview` — legacy landing links redirect to Dashboard
- `#contract` — review illustrative schedule values and confirm a baseline
- `#completion` — review cumulative reported and verified physical progress
- `#whatsapp` — Site updates: review mock worker messages and generated photos
- `#vo` — Extra work: assess flags and track local approval decisions
- `#claims` — saved claims and guided preparation from verified work and approved VOs
- `#claim-preview?draft=…` — preview a saved revision, download CSV or print/save PDF
- `#claim-status?draft=…` — track mock submission, certification and payment for one prepared revision

## Mobile supervisor demo

In **Site updates → Progress**, review a pending update and choose **Open mobile review**. This focused view shows one report’s original message/photo, work item, area and physical completion. **Confirm** accepts the reported total; **Correct** records a different verified total with a reason; **Can’t verify** records a clarification reason and leaves verified progress unchanged. Return to the same Site progress record to see the decision and updated Needs attention task. Existing desktop review remains available.

This is a browser-local preview, not a shared link or live approval service. It sends no messages. Unfinished review fields stay separate by project/report while browsing; save before refreshing. Completed, superseded or changed reports cannot be reviewed again from a stale view. Original evidence, saved claim versions, exports and claim tracking remain unchanged.

## Claim item evidence

In **Extra work → Review actions → Link to existing VO**, choose the open VO for the same extra work, enter a reason and **Save link**. Both records must be open for editing, without a previous price approval or inclusion in a saved claim; cases awaiting approval can use **Need information** first. Unfinished QS edits must be saved or finished before linking.

The supporting record stays read only with **Open VO-…**, and the destination keeps its normal scope, instruction, approval and claim checks. Expand **Related evidence** to see each preserved original message/photo, sender/date, reason and exact source record. Linking does not combine prices or create another claim value. New saved claims capture the related evidence with that assessment; earlier claims and exports stay unchanged. This remains a local mock workflow.

Use **View evidence** on a work item or VO in Choose work, Enter totals or Review. The read-only panel shows the original message/photo, sender/date and supervisor or VO decision supporting that claim cutoff. Closing with Done, the close button or Escape returns to the same item without changing selections, unfinished inputs or saved claims.

In **Preview & export**, each saved schedule item opens evidence captured with that exact version. New site updates, changed reviews or missing live records never replace its saved evidence. Missing attachments are shown explicitly. These controls stay out of the printed claim; its existing evidence appendix remains available.

## Mock claim basis

In **Enter totals**, expand **Claim basis** to set cumulative quantity × rate billing, no retention or a retention rate with a cumulative monetary cap, and previously submitted net amounts/reference. Item-level **Claimed before (gross)** values stay separate from the prior net total. Confirm the settings and prior submissions before preparation; saved drafts and status tracking never become prior claims automatically.

Review reconciles gross value, retention held, cumulative net and prior submitted net to this month's net claim. For example, SGD 14,094 gross with 5% retention and a SGD 1,000 cap gives SGD 13,389.30 net with no prior submission. These are explicit mock QS inputs, not extracted S.I.T. terms. The supported profile is SGD quantity × rate; other methods/currencies require review. Tax, advances and retention releases remain outside this prototype.

Existing gross-only drafts keep their original calculation until **Set claim basis** is chosen for a new revision. Saved versions, evidence, preview/CSV/PDF and tracker amounts retain the basis captured with that version; incomplete settings can be saved for later but cannot be prepared.

## Add a demo inbox message

In **Site updates → Messages**, choose **Add demo message**. Enter formatted text for the selected project, or use **Use example**, and optionally choose one bundled demo photo. The format is `PROJECT | Location | Area | Item ID | COMPLETE=50% TOTAL`; the completion field can also start on the next line. Use the contract item ID (such as `WI-016`) and a saved area code or alternate name. Interpretation is a local format parser, not AI or a live WhatsApp connection.

**Preview message** shows the unchanged text/photo and the interpreted contract item, site area and cumulative completion. Invalid format or a different project must be corrected first. Unknown or shared area names and unclear completion go to clarification. Changing the text, photo or project mapping requires another preview. **Save to inbox** adds one new mock message and opens its exact record; it creates no progress report, approval or claim value. Ready messages still need **Confirm match → Add progress update → Supervisor review**. Existing evidence, saved claims and other projects stay unchanged.

Cancel or close keeps unfinished entries separate by project while browsing; save before refreshing. Successful saves clear the entry buffer, and retrying the same saved entry never duplicates its message. Demo photos are explicitly labelled generated illustrations.

## Review a suggested message match

New mock free-text suggestions offer **Review match** inside the WhatsApp panel. Check the suggested work item and site area against the original message/photo, or use **Edit match** to choose another measured item and compatible area. A changed suggestion needs a short correction reason. The reported percentage stays fixed; unclear or incremental completion and conflicting explicit references still require the separate worker clarification flow.

**Confirm match** saves the review only. **Add progress update** remains a separate action and creates pending reported progress; a supervisor must still verify it. An open edit form blocks processing until confirmed or canceled. Unfinished edits stay isolated by project/message while browsing; save before refreshing. Changed source, baseline or mapping requires another review.

The original message, photo, sender/date and mock suggestion are retained. Processed reports, evidence panels and new claim snapshots keep the confirmed item/area, correction reason and reviewer. Existing drafts, prepared/paid claims and exports stay unchanged. Earlier structured messages retain their existing workflow; there is no automatic migration or live AI.

Use **Site updates → Demo options → Try match review demo**, or the same option under **Drawing & areas → Try another demo**, for an independent project with a correct suggestion, a mistaken roofing/WEST suggestion for EAST wall cladding, and an ambiguous area that requires clarification. No existing project is copied or reset, and no message is sent.

## Main showcase and Demo examples

The original S.I.T. project is the main showcase in the project picker and All projects. Test fixtures stay under a collapsed **Demo examples** section; search includes them, and the selected example remains accessible. No projects are deleted or merged.

**Try demo** reopens the active matching example, or the first existing one, before creating a fixture. Progress, saved claims and unfinished forms stay with that project. Explicit **New project** and contract imports still create independent projects when requested.

The main S.I.T. showcase also includes synthetic voice notes, a mistaken match and shared-area clarification, using D.5 cantilever brackets split into two simulated, unplaced 90-piece zones. Existing source rows, messages, reports, progress and saved claims stay unchanged. Changed or already-used D.5 scopes are skipped with an explanation. Opening these examples in the main showcase stays in that project. Its original saved claim supports preparation, tracking and query/revision; completed/incomplete comparison records remain optional Demo examples. Recovery/re-extraction stays optional so it never replaces the checked S.I.T. contract automatically.

## Project dashboard

The sidebar opens separate modules with icons, without numbered stages or a module-header stepper. Dashboard is the default landing module. Overview is removed; its old landing links redirect to Dashboard, and old exact-record links preserve their record and return to Dashboard. All projects remains separate. Steps remain inside individual tasks, including contract import and monthly claim preparation; these navigation changes alter no saved records or form state.

**Dashboard** keeps three summary cards: **Latest claim** shows its saved amount, month and status and opens that exact record; **Extra work to review** shows the existing review count and opens VO review; **Claim-eligible extra work** shows the value passing QS eligibility checks. Eligibility does not mean the amount is unclaimed or unpaid, and remains separate from price approval. **Recent claims** shows up to three months, using the latest saved revision for each, with status, amount, direct record links and **View all monthly claims**. Pending tasks stay in the notification bell; Dashboard has no duplicate task table, status charts or extra-work summary/list. **Back to dashboard** is preserved after reload. Summaries use the existing calculations and saved mock records: revisions are not added together, unknown values stay unknown, and saved claim assessments, evidence and tracking remain unchanged. No Mighty One business data is copied.

## Dismiss and reopen inbox messages

For a new message that was sent by mistake, choose **Message actions → Dismiss message**, enter a reason and save. It leaves New and Needs attention, while the original message and attachments stay available under **All** or **Dismissed**. **Message actions → Reopen** requires another reason and returns the same message to review without processing it. The latest reason, reviewer/time and decision history stay with the original.

This inbox action is available only before processing and before a clarification thread exists. Existing progress reports and extra-work cases keep their own review actions. Finish or cancel open match/transcript edits first; unfinished clarification forms remain in their existing project/message buffers. Decisions are local to the selected project and never change reported/verified completion or saved claims/exports.

## Progress checks before processing

WhatsApp review shows one compact **Progress check** after the work item and area are confirmed. It explains an unchanged cumulative total, an earlier update with a newer report, or a percentage below the current reported/verified total. Allocated areas compare their own progress; whole-item observations stay separate. **View latest report** opens the exact same-scope Site progress record, supports reload and provides **Back to message**. Viewing the comparison changes no records.

Repeated totals keep their original evidence and remain cumulative. The existing processing flow holds older updates for clarification. Lower verified completion still requires a supervisor’s reviewed correction and reason; the panel does not approve or reject a report automatically. Existing saved claim snapshots and exports remain unchanged.

Use **Messages → Demo options → Try progress checks** to append three labelled mock inbox examples to the selected project, using an existing dated scope with known progress. Review each match before processing. Repeating the action reopens the existing examples without replacing edits, creating another project or changing completion. If no suitable report exists, verify a site update first. The older example keeps its earlier simulated source timestamp separate from its received time.

## Mock voice-note review

Use **Site updates → Demo options → Try voice-note demo** for a separate project with two synthetic recordings. The clear WEST cladding update has a deliberate `wail`/`wall` transcript typo; the EAST update says “another 10%” without a cumulative total. Audio is generated for demonstration; no live transcription is connected.

Listen, **Confirm transcript** or **Edit transcript**, and save a correction with its reason. Original audio/text and earlier reviews remain available. Then use the existing **Confirm match → Add progress update → Review progress** flow. Saving a transcript never changes progress. Unclear recordings and unsupported meanings use the existing clarification request and separate worker reply; the reply retains the original recording. After processing or clarification, the original transcript review is read-only.

Unfinished transcript fields stay separate by project/message while browsing. A correction requires another match review; drawing changes preserve the transcript but require a current mapping match. Saved report/claim evidence retains its recording, transcript and correction reason, even when live records change. Existing projects and saved claims are preserved. See [demo audio sources](public/assets/DEMO-AUDIO.md).

## Mock clarification replies

Open an unclear WhatsApp message and **Save clarification request**. Use **Use demo reply** or enter a measured work item, compatible site area, cumulative total and worker reply, then **Save mock reply**. The original message and photo stay in the thread; the reply is a separate saved message and reuses the original attachment with an explicit label. No progress changes until **Add clarified progress update**. Use **Verify clarified progress** for the supervisor's review. Needs attention follows the reply and then its pending report, clearing that action after verification. Threads survive reload, while unfinished forms remain in session memory by project/message. This is a local demonstration; no WhatsApp message is sent.

## Mock claim status

After marking a saved claim **Prepared**, choose **Track claim status**. Record a mock submission, a certificate and the total paid to date. **Use demo details** fills an example for review; each stage still requires an explicit save. A partial payment stays at **Certified** until the recorded total matches the certified amount. Different certified and claimed amounts require an explanation.

The tracker keeps the saved version and claim amount intact. Its dates, references, amounts and history stay with that project and revision in browser storage. They do not change earlier claimed amounts or the saved assessment/export, and no real submission, certification or payment takes place.

The status summary shows **Balance to receive (certified)** from the recorded certified amount minus total paid. An unrecorded payment stays unknown. When certification differs from the saved claim, **Difference from claim** shows claimed minus certified, with its saved **Certification note** available on demand. This difference is not automatically a disputed or unpaid amount. **Certified amount fully paid** means payments match certification; any difference from the original claim remains separate. These display values change no records or exports.

For a submitted claim, choose **Record a query** to flag the whole claim or a saved work item/VO. **Revise claim** opens a separate copy with the query and a required QS response. Review the quantities and prior values, **Save revised claim**, then mark the new version prepared and **Record resubmission**. The original query and assessment remain available, with links between versions. Unfinished revision edits stay separate from other claims while browsing; save before refreshing.

## Demo walkthrough

1. Select **Campus Scaffold (Demo)**. Review WI-001's simulated extraction mismatch: 2,800 m² was read; the fictional reference is 2,000 m². Confirm the item and baseline.
2. In **WhatsApp processing**, process the WI-001 photo update. Reported completion changes to 65%; verified completion stays at 25% until reviewed. Cumulative percentages replace the total. Replaying an event creates no duplicate report.
3. Process an extra-work message. In **VO review**, inspect the original evidence and compare contract scope. Record the scope decision and instruction evidence, then record price approval. Check verified extra-work evidence and save an explicit claim eligibility decision before opening Monthly claims. Decisions retain their history.
4. In **Monthly claims**, choose a month and enter QS-assessed cumulative quantities and VO values. Review prior claimed values, confirm any undated evidence as of the cutoff, save a revision and mark a valid draft prepared. Prepared drafts do not become prior claimed values. Open **Preview & export** from Saved drafts to read the frozen revision, download its CSV or use Print / Save PDF.

5. Switch to **Warehouse Extension (Demo)**. Its schedule, activity, VO reviews and claim drafts remain separate. New projects offer a fictional warehouse sample or an empty register for mock contract upload.

Claim preview and PDF follow the supplied progressive-claim form: saved subcontractor heading, recipient/project/assessment details, a bordered schedule with **S/No, Description, Contract amount, Previous claim, Current claim, Cumulative claim and Remark**, reconciliation and blank signature/receipt areas. Contract amounts cover the selected work and approved VO ceilings; the declared full contract sum stays separate. Quantities, rates, physical verification and approval details remain visible, and the saved assessment date is not labelled as a submission date.

On the latest unsubmitted claim preview, **Edit claim details** lets QS change the recipient/attention/address, printed project name/code, contract and claim references, claim date and company contacts. **Save new version** creates a Draft with the same saved amounts and evidence; earlier versions remain unchanged in History. The printed code does not change the workspace project or WhatsApp matching. Leave unknown contacts blank; a blank claim reference uses the new version's system ID. Submitted months keep their existing query/revision workflow.

PDFs use A4 portrait with repeating schedule headers. Every page retains the saved project name, claim month, claim reference and **Page X of Y**. The full **Evidence index** follows the claim summary and notes, including saved photos, original messages, senders/dates, voice transcripts, match corrections and related VO evidence. Long evidence continues without truncation. Generated photos remain labelled demo images. The sample's customer contact details, logo, handwriting, signatures and stamps are not copied. Viewing or printing changes no saved assessment, calculation, tracking or CSV data. Use current Chrome or Edge and turn off the browser's own **Headers and footers** to avoid duplicate browser details.

## Checks

```bash
npm run typecheck
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

For recovery, enable **Try failed-page demo** before extraction. Page 1 keeps four successful items and leaves two unread. **Retry page** restores only those missing items; **Enter manually** records them from the unchanged demo PDF. Canceling manual entry keeps the entered fields while the dialog remains open. Blank quantity/rate stays unknown and zero stays zero. Recover both items before **Review work list**; manual entries still need source review and explicit confirmation. The existing quantity mismatch is retained, and recovery never changes prior saved claims.

## Drawing and area mapping

Open **Contract → Drawing & areas**, then **Use demo drawing** or select a local PDF/image. Choose an area, link its contract work items and **Save area links**. Add your own area codes as needed. Image plans support pins; PDF references use an area name and page. Mapping is manual and does not measure work.

Use the searchable **Site area** picker or select a drawing pin. The selected area shows its linked items with **Contract quantity** and **Quantity in this area** side by side. **Not allocated** means no measured area quantity has been saved; **Link only** identifies Included/rate-only scope. **Edit area mapping** starts with the linked items and quantity inputs; **Add item** opens searchable available work. Other selections and unfinished quantities stay intact while searching. On mobile, switch between **Drawing** and **Area details**. Saving stays explicit with **Save area links**.

Saved links appear in contract item details, site-message review and Progress. A message naming a work item that conflicts with its area link is held for clarification. A map never turns an unclear message into automatic completion. Existing report evidence, baselines and claim snapshots remain unchanged.

Drawing metadata and saved areas stay in browser storage. Custom file previews last for the current session; choose the same file again to restore a preview without replacing links. The bundled fictional plan remains available after reload. Replacing a drawing retains area names/links but clears pin positions for review. Reset clears only the selected project's drawing and mappings.

## Alternate area names

In **Drawing & areas → Edit area mapping → Alternate area names**, use optional **Also known as** for comma-separated names such as `West wall, West façade`. Save with **Save area links**. Up to eight names of 100 characters each are supported; leave blank to use the code only. Names match exactly after case, spacing and Unicode normalization, with an optional `Area` prefix; there is no fuzzy matching or AI interpretation.

A unique code or alternate name matches the saved area and its quantity allocation. If a name matches multiple areas, WhatsApp shows the candidate codes and **Needs clarification**. No progress or VO is created. Record a clarification request and a separate mock worker reply with an explicitly chosen area before processing and supervisor verification. **Use demo reply** leaves an ambiguous area blank for review. Possible extra-work ambiguities retain their separate QS follow-up; clarify the area outside the demo and use **Add extra work** for the confirmed manual record.

Original text, photo, sender and date remain unchanged. New reports retain their chosen area and alternate names; later alias edits cannot move saved evidence, progress or claim snapshots. Existing projects are not migrated. Codes that overlap another area's alternate name also require clarification unless an existing frozen source explicitly identifies the area.

Use **Drawing & areas → Try another demo → Try area name demo** for a separate project with `West façade` and `East wall` matches, plus an ambiguous `Wall frontage` message. It does not copy or reset existing projects, and no message is sent.

## Completion on the drawing

Open **Contract → Drawing & areas** to see Not started, In progress and Completed colours from linked work items. **Verified** shows supervisor-checked totals; **Reported** shows worker updates. Select an area and choose **Open site progress** to open just its linked items. Verify a pending report there and return to the drawing to see the status change.

Without an explicit quantity split, linked areas retain whole-item progress. Set **Quantity in this area** for a measured item to track each area independently. Multiple different work items are summarized by counts rather than averaging unlike quantities. Unlinked areas and missing progress remain distinct.

**Try completion demo** opens a separate fictional project containing all three completion states and a pending report for review. Existing projects are preserved. No backend or live AI is connected.

## Split contract quantities across areas

In **Drawing & areas → Edit area mapping**, link a measured item and optionally enter **Quantity in this area**. The compact summary shows contract quantity, allocated elsewhere and the remainder. Use the original contract unit; positive quantities allow up to four decimal places and all areas together cannot exceed the contract quantity. Blank stays a context link; Included and Rate only scope have no quantity split. **Save area links** confirms the change.

An explicit split starts separate area tracking from new reports. Original whole-item progress is retained in history and is never copied into every area. A new split message must identify an allocated area; a missing/conflicting area needs clarification. A 50% report for 600 m² and a 25% report for 400 m² record 300 + 100 = 400 m² of a 1,000 m² contract item, or 40% overall. Each area's latest cumulative report replaces that area's previous total. It does not supersede another area's pending review. Missing reports stay unrecorded, and any unallocated remainder is shown separately.

The drawing and an area-filtered Site progress view show that area's percentage. The full progress list shows the quantity-weighted contract-item total, with a compact **Area breakdown** to review each area. Reported and supervisor-verified totals stay separate. Once a scoped report exists, its quantity/link is retained; code/name/pin edits remain available. A later incompatible contract quantity requires allocation review and never silently rescales old reports.

New monthly claims still contain one financial row per contract item and require explicit QS-assessed quantities. Its weighted verified percentage and all contributing area messages/photos are captured at the claim cutoff. **View evidence** switches between those frozen originals; CSV/PDF list each source once. Existing drafts, prepared/paid claims and their exports remain unchanged.

Use **Drawing & areas → Try another demo → Try area split demo** for an independent fictional warehouse: 720 m² West + 480 m² East, with 50% and 25% mock reports. Process both, then verify each to see 40% weighted completion. No existing project is copied or reset. The example's generated façade photos are illustrative attachments, not evidence of actual cladding or measured geometry.

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

Explore the drawing to see verified, pending and not-started work, related messages/photos, an extra-work scope query, a fictional approval and an included-scope rejection. Open **Contract → Drawing & areas** to explore the plan, or **Monthly claims** to review the saved example. All parties, values, activity, approvals and area pins are demonstration data.

The example claim is a saved draft using explicitly mocked QS inputs, separate from physical percentages. It shows gross values before retention, GST or other deductions; nothing is submitted, certified or paid. **Reset demo** restores the selected project's seeded workflow and clears its drawing mappings, following the existing reset behavior.

The fictional campus fixture and plan remain available alongside the source-backed S.I.T. option. Browser-local projects and existing edits are never copied into a new demo. Run `npm run test:provided-demo` to check the fictional scenario.

## Original S.I.T. contract scenario

Open **All projects → New project → Original S.I.T. contract — realistic scenario**. The form suggests an independent **SIT-DEMO01** code (or the next unused code), preserving existing campus, warehouse and original-demo projects. Create the project, then open **Contract → Drawing & areas** or **Monthly claims** from the sidebar.

The contract identity, parties, original rates, source quantities and source dates come from the supplied S.I.T. scaffolding schedule. The 18 rows are a representative subset, not the full contract schedule. **Compare with contract** displays the source schedule; **Drawing & areas** displays the supplied site plan with illustrative W3/W5 links. The two images persist across refreshes without a database or file upload.

When the app loads, existing original S.I.T. demos automatically receive the matching generated message photos, including inactive projects. Only recognized bundled illustrations and consistent paired reports are refreshed; prior photos remain in **Earlier demo illustrations**. Uploaded attachments, changed scopes or mismatched evidence are retained. Progress, VO decisions, baseline and reset data, and saved claim revisions stay unchanged. Reloading again does not repeat the update or add duplicate history.

Saved claims and exports keep the evidence captured in that revision. If refreshed report evidence differs from an unprepared saved draft, the existing source-change check still requires reviewing and saving a new revision before preparation; the photo refresh does not rewrite or automatically prepare claims.

The scenario includes a newer 65% worker report against 50% verified work, completed and not-started items, an unclear incremental message, an additional-platform scope query and explicitly simulated approval/rejection examples. The saved claim uses separately specified mock QS inputs and remains an unsubmitted gross draft before retention, GST and deductions. No source percentage automatically creates claim money.

This source profile is intended for the user-requested deployed showcase. Deploying it makes the included real contract metadata, prices and two source images accessible with the app. The full original PDF and other uploaded documents are excluded. Run `node --test tests/sit-contract-demo.test.mjs tests/source-documents.test.mjs` for source integrity, project isolation, preview resolution and saved-evidence checks.

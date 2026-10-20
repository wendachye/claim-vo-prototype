# Prototype instructions

Follow the existing React and UI conventions. Use Next.js App Router for the shell and standard production builds for Vercel. App UI belongs in `src/`. The workspace mounts in a client-only dynamic boundary to preserve browser-storage initialization and hash links. Keep assets local and verify the preview after visual changes. Vite is retired.

Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` intact. The optional Sites handoff requires `npm run build:sites` and `npm run test:sites`, producing `dist/client/index.html`, `dist/server/index.js` and `dist/.openai/hosting.json`.

Never create or amend Git commits or deploy without the user's explicit request.

## Public demonstration data

All public fixtures must remain fictional. Do not add uploaded contracts, commercial records, client drawings, personal data, credentials or machine-specific paths. Generated site photos must be labelled as demonstration images.

The campus dataset uses the stable internal ID `SIT01` for migration compatibility. It does not identify an actual project.

## Project workspaces

Keep items, source references, baselines, messages, reports, physical progress, VO reviews, claim drafts and history isolated by project. The top-navigation dropdown is available from every module and switching preserves the module. New projects offer a fictional sample for the full workflow or an empty register for the mock contract upload. Preserve edits during migration and reset only the selected project.

## Mock workflow

Matched cumulative messages update reported completion only. Supervisor verification requires a confirmed baseline. Ambiguous messages require clarification without changing progress. Retain messages/photos and prevent duplicate events.

Flagged extra work shares VO review records across modules. Track Flagged, Needs information, Awaiting approval, Approved and Rejected, retaining evidence and decision history. Unknown values remain unknown and zero remains valid. Reopen final decisions with a reason before editing.

Monthly claim preparation requires explicit QS-assessed quantities/values and checked prior claimed values. Respect the monthly cutoff, distinguish undated seed progress, exclude unapproved VOs and unsupported pricing types, and retain immutable draft revisions. Prepared drafts never become previous claimed values. Changed sources require a new revision before preparation.

Claim preview and CSV/PDF exports must use the saved revision, including financial values and evidence. Capture project/contract details on new revisions; label legacy metadata fallback clearly. Keep unknown, zero and negative values distinct, neutralise spreadsheet formulas, and guard foreign project/draft IDs. Exporting must not change claim status, progress or previous claimed values. Use print styles for PDF and run `npm run test:claim-pack` after changes. Keep `agentRules: false` so Next.js does not overwrite these instructions.

All approvals and prepared claims are local demos; they submit nothing and certify no payment. Backend, live WhatsApp, AI extraction and real approval permissions remain future work. Run the relevant state tests and production build after changes.

## Simple, connected workflow

Design for a nontechnical user. Keep the current Mighty One visual style while reducing repeated statistics, project summaries and notices above the work. Use plain labels and a visible sequence: Contract → Site updates → Extra work → Claims. Start on the selected project's overview with one clear next action. Keep messages and progress together under Site updates; retain original evidence and show where each action leads. Monthly claims starts with saved claims, then guides preparation through Choose work → Enter totals → Review. Put history and secondary details behind expandable controls. Simplification must preserve prior-claim reconciliation, financial validation, project isolation and explicit saving.

## Consistent layout and controls

Use the shared PageHeader, BackButton, FormField and FormActions patterns. Return links sit above the detail title at the upper left, use a left arrow and name their destination. Keep workflow step back actions at the left of the bottom action row; group the main action at the right. Form labels, optional markers, help/error text, control heights, borders, spacing and focus/disabled states follow layout-system.css. Preserve explicit labels/IDs, validation focus, browser-local edits and incomplete draft saving. Dialogs retain an upper-right close button; claim preview navigation stays outside the printed document. Avoid module-specific button and field sizes.

## Current stage: validate the prototype

The user wants to confirm the UI and end-to-end workflow before real development. Continue with frontend screens, mock data and simulated interactions. Prioritize understandable navigation, linked steps, realistic review/status states and a complete showcase journey. Database, production authentication, backend services, live AI and WhatsApp integrations stay deferred until the user explicitly moves into real development. Vercel deployment alone does not change this scope.

## Complete mock walkthrough

New projects offer a separate fictional warehouse sample with six work items, four current-month mock messages and no saved progress, VO decisions or claims. Empty projects remain available and can start the mock contract upload flow. Selected PDFs are preview only; the extraction demonstration uses the bundled fictional work list. Never copy existing browser-edited project state into a new mock project.

Keep the next step clear after confirming contract items, confirming the work list, processing messages and preparing claims. Site processing retains the selected result so verification or VO review is visible, including when the inbox was filtered. Extra-work links and counts include recorded approvals and rejections.

Unfinished contract, VO and claim forms remain in session memory while browsing between modules or projects. Saving remains explicit; tell users to save before refreshing. Buffers must be isolated by project and record/version, clear on project reset or successful save, and never silently update financial records. Block work-list confirmation if current contract edits are still unfinished.

## Mock contract upload and extraction

Contract upload stays frontend-only. Users can choose a local PDF up to 30 MB or the bundled fictional warehouse PDF, see cancelable simulated extraction, and review six preset work items with one quantity mismatch. Make it clear that selected-file contents are not parsed. Review uses the matching fictional PDF and source rows; selected filenames are separate input metadata and must never be presented as evidence for the preset values.

Apply the result to a truly empty project only. If any contract or workflow data exists, create a uniquely named demo project and preserve the existing project, local edits and claim snapshots. Keep file bytes and object URLs out of persistent project storage. A selected PDF preview is session-only; the bundled source remains available after reload. Retain the existing item checks and explicit work-list confirmation before progress verification. Do not connect a backend or live AI, commit, push or deploy without a new user request.

## Drawing upload and area mapping

Drawing & areas belongs under Contract. Support a bundled fictional plan and local PDF/PNG/JPEG/WebP selection up to 15 MB. Images support manually placed normalized pins and keyboard coordinate fields; PDF areas use names and page references. Do not infer scale, quantities, progress or claim values from a drawing. Store only drawing metadata, area links and mapping history; file previews remain session-only and can be reattached after refresh.

An area can link to multiple work items from the selected project. Saving is explicit, codes are unique per map, and stale drawing IDs or foreign item IDs must be rejected. Replacing a drawing keeps named links but clears pin positions and page references for review. Reset clears only the selected project's drawing and area mappings. Keep existing contract baselines, financial values, original reports and saved claim snapshots intact.

Show saved area links in Contract, Site updates and Progress. A conflicting explicit work item and saved area link requires clarification before processing a new WhatsApp progress report; ambiguous area-only messages still require an item and completion basis. Save a copy of the mapped area with newly processed reports so later remapping cannot rewrite earlier evidence. Backend, drawing AI and live WhatsApp remain deferred; commit/push only when explicitly requested.

## Completion on drawings

Drawing status derives live from the selected project's linked whole work-item totals. Offer Verified (default) and Reported views with explicit labels. Use Not started for zero, In progress for partial/mixed known work and Completed only when every linked item reaches 100 in the selected basis. Unknown progress and unlinked areas stay distinct. Do not average mixed work items, infer area quantities, or convert progress into claims. The same item linked to several areas shows the same whole-item status, with that limitation stated.

Keep the drawing readable: show a status legend, text as well as colour, a selected-area summary and a direct link to its filtered Progress list. Mapping edits remain explicit and secondary to the status view. Opening Progress from an area retains that area in the link; clearing filters or switching projects clears the area scope. Missing or foreign areas must not show other project records. Verification in Progress updates the drawing through the same project state.

Try completion demo opens a new, clearly fictional project with linked areas and seeded progress illustrating all three statuses; it must never overwrite existing records or claims. This remains frontend-only. Commit, push and deploy only when explicitly requested.

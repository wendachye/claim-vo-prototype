# Prototype instructions

Follow the existing React and UI conventions. Use Next.js App Router for the shell and standard production builds for Vercel. App UI belongs in `src/`. The workspace mounts in a client-only dynamic boundary to preserve browser-storage initialization and hash links. Keep assets local and verify the preview after visual changes. Vite is retired.

Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` intact. The optional Sites handoff requires `npm run build:sites` and `npm run test:sites`, producing `dist/client/index.html`, `dist/server/index.js` and `dist/.openai/hosting.json`.

Never create or amend Git commits or deploy without the user's explicit request.

## Public demonstration data

All public fixtures must remain fictional. Do not add uploaded contracts, commercial records, client drawings, personal data, credentials or machine-specific paths. Generated site photos must be labelled as demonstration images.

The campus dataset uses the stable internal ID `SIT01` for migration compatibility. It does not identify an actual project.

## Project workspaces

Keep items, source references, baselines, messages, reports, physical progress, VO reviews, claim drafts and history isolated by project. The top-navigation dropdown is available from every module and switching preserves the module. New projects start empty. Preserve edits during migration and reset only the selected project.

## Mock workflow

Matched cumulative messages update reported completion only. Supervisor verification requires a confirmed baseline. Ambiguous messages require clarification without changing progress. Retain messages/photos and prevent duplicate events.

Flagged extra work shares VO review records across modules. Track Flagged, Needs information, Awaiting approval, Approved and Rejected, retaining evidence and decision history. Unknown values remain unknown and zero remains valid. Reopen final decisions with a reason before editing.

Monthly claim preparation requires explicit QS-assessed quantities/values and checked prior claimed values. Respect the monthly cutoff, distinguish undated seed progress, exclude unapproved VOs and unsupported pricing types, and retain immutable draft revisions. Prepared drafts never become previous claimed values. Changed sources require a new revision before preparation.

Claim preview and CSV/PDF exports must use the saved revision, including financial values and evidence. Capture project/contract details on new revisions; label legacy metadata fallback clearly. Keep unknown, zero and negative values distinct, neutralise spreadsheet formulas, and guard foreign project/draft IDs. Exporting must not change claim status, progress or previous claimed values. Use print styles for PDF and run `npm run test:claim-pack` after changes. Keep `agentRules: false` so Next.js does not overwrite these instructions.

All approvals and prepared claims are local demos; they submit nothing and certify no payment. Backend, live WhatsApp, AI extraction and real approval permissions remain future work. Run the relevant state tests and production build after changes.

## Simple, connected workflow

Design for a nontechnical user. Keep the current Mighty One visual style while reducing repeated statistics, project summaries and notices above the work. Use plain labels and a visible sequence: Contract → Site updates → Extra work → Claims. Start on the selected project's overview with one clear next action. Keep messages and progress together under Site updates; retain original evidence and show where each action leads. Monthly claims starts with saved claims, then guides preparation through Choose work → Enter totals → Review. Put history and secondary details behind expandable controls. Simplification must preserve prior-claim reconciliation, financial validation, project isolation and explicit saving.

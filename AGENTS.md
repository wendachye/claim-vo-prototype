# Prototype instructions

Preserve the existing React, Vite and UI conventions. App UI belongs in `src/`. Run the local preview when verifying visual changes.

Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` intact. Before a hosting handoff, run the production build and hosting checks.

Never create or amend Git commits without the user's explicit request.

## Public demonstration data

All public fixtures must remain fictional. Do not add uploaded contracts, commercial records, client drawings, personal data, credentials or machine-specific paths. Generated site photos must be labelled as demonstration images.

The public campus dataset intentionally uses the stable internal ID `SIT01` for migration compatibility. It does not identify an actual project.

## Project workspaces

Keep items, source references, baselines, messages, reports, physical progress, VO reviews and history isolated by project. The top-navigation project dropdown is available from every module and switching preserves the module. New projects start empty. Preserve existing local edits during migration and reset only the selected project.

## Mock WhatsApp and VO workflow

Processing a matched cumulative message changes reported completion only. Supervisor verification requires a confirmed contract baseline. Ambiguous messages need clarification and cannot change progress. Retain original messages/photos and prevent duplicate events.

Flagged extra work uses the same VO review records across modules. Track Flagged, Needs information, Awaiting approval, Approved and Rejected, retaining evidence and decision history. Unknown values remain unknown and zero remains valid. Approval records are local demo decisions; they do not change completion, contract totals, claims or payments. Reopen final decisions with a reason before editing.

Backend, live WhatsApp, AI extraction and real approval permissions remain future work.

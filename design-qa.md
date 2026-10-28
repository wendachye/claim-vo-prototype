# Dashboard visual check

Source visual truth: Mighty One dashboard, supplied by the user at https://one-staging.mightyjaxx.technology/dashboard. Source screenshots are local task artifacts `mighty-reference-desktop-top.png` and `mighty-one-dashboard-mobile-reference.png`; they are excluded from the repository. No source business records are used in the prototype.

Implementation: localhost `#dashboard`, with local task artifact `claim-dashboard-desktop-top.png`.

Comparison scope: adapt the reference's compact financial-summary hierarchy to the existing Claim & VO product. Keep its own branding, blue theme, selected-project selector and original workflow. This is not a copy of the licensing product or its sample records.

## First comparison

- Desktop source and implementation: 1680 × 899 CSS pixels, screenshot density 1×, no scaling. Both are at the top of their Dashboard route, light theme, with loaded sample records.
- Both desktop screenshots were presented in the same comparison input. The hierarchy, three-column KPI layout, tinted library icons and bounded attention table match the reference concept. The number of attention rows differs deliberately because only genuine project follow-ups are shown.
- [P2] KPI value leading makes the two rows slightly taller than the reference. Tighten the value line height from 1.4 to 1.2 and recheck the section rhythm.
- Fonts: both use Inter, with 20 px page headings, 16 px section headings and muted 13 px labels. Existing Claim & VO navigation remains intact.
- Colors: pale background, white cards, subtle borders and semantic accents; retain the product's blue focus states.
- Images: no content imagery is required. Icons use the existing Lucide library, consistent with the reference. Neither the Mighty One logo nor private source content is copied.
- Content: saved claim amounts, approval/eligibility values and status counts use the selected project's records. Unknown amounts are not zero; no payment forecasts or artificial months are added.

## Final comparison

- The revised desktop capture `claim-dashboard-desktop-final.png` was presented together with `mighty-reference-desktop-top.png` at 1680 × 899 CSS pixels and 1× density. The earlier value-leading issue is fixed. Cards retain the compact two-row rhythm without module arrows or step numbers.
- Focused comparison: `mighty-reference-kpi-focus.png` and `claim-dashboard-kpi-focus.png` were captured and viewed together. Label hierarchy, 24 px values, tinted library icons, inset spacing, borders and corner treatment are consistent with the source pattern.
- Mobile comparison: `mighty-reference-mobile-top.png` and `claim-dashboard-mobile-top.png` were captured and viewed together at 390 × 844 CSS pixels, 1× density and no scaling. Tiles stack in one column. Existing product header controls and the Overview link are intentional differences.
- Full implementation evidence: `claim-dashboard-mighty-one-layout.png`. Lower status panels and saved-record summaries were also inspected in the browser. Labels and amounts remain readable and no imagery is missing.
- The mobile document width stays 390 px; the attention table has its own keyboard-focusable horizontal scroll container (356 px client width, 680 px table width). It does not hide persistent page controls.

## Interaction and regression checks

- Opened a real dashboard claim follow-up, reloaded its exact draft link, and returned with Back to dashboard. Opened the flagged VO follow-up and returned to the same summary.
- Project switching, unknown-versus-zero amounts, latest-per-month status counts, saved-record links and preservation of original claim packs are covered by UI and state tests.
- Browser error log: no errors during the local walkthrough.
- Native state tests: 532 passed. Full UI tests: 356 passed. After the final typography/copy adjustment, focused dashboard tests: 8 passed. Strict TypeScript, final production build and whitespace checks passed.
- No database, live messages, approvals, payments, deployment or Git commit was performed for this design update.

## Intentional adaptations and checklist

The financial source's licensing-specific owners, deadlines, forecasts and example values are outside scope. Claim & VO shows only its own saved mock records and genuine claim/VO follow-ups, not invented historical payments or arbitrary trends. Its existing brand, blue theme and project selector remain intact. Numbered steps remain inside individual task forms; Overview retains Your next step and unnumbered module cards.

- [x] Capture and jointly compare desktop, mobile and focused reference/implementation images.
- [x] Fix the earlier P2 typography issue and inspect the revised capture.
- [x] Verify meaningful navigation, responsive tables and empty/unknown states.
- [x] Preserve project data, unfinished forms and saved claim versions.
- [x] Complete state tests, UI tests, strict TypeScript and production build.

No actionable P0/P1/P2 findings remain in the requested adaptation. No additional P3 polish is required for handoff.

## Separate-module navigation update — 26 October 2026

Removed sidebar ordinal numbers and the shared module-header stepper, including its unused styles. The sidebar now uses the existing module icons. Overview retains Your next step, status badges and recent activity, with unnumbered module links. Claim preparation and contract upload steps remain intact.

Checked Contract and Site updates headers, collapsed icon navigation, and the mobile menu on localhost at 1440 × 900 and 390 × 844. Module highlights and exact-record links remain correct. Desktop Overview evidence is the local task artifact `separate-modules-overview.png`; the mock claim still shows Prepared, version 2, SGD 21,969.00. No browser errors or saved-record changes were observed.

Validation: 20 focused navigation tests, 12 workflow state tests, all 357 UI tests, strict TypeScript and the production build passed. Changes remain uncommitted for review.

final result: passed

## 2026-10-28 — Approved VO related evidence

- Added Review actions → Link to existing VO with shared shadcn selection, required reason, explicit Save link/Cancel and per-project/case unfinished buffers. Unsaved QS edits block linking. Only editable unapproved, never-claimed cases can link; pending approvals return through the existing Need information action. Original reports, messages/photos, VO reviews, progress, baselines and saved claims remain intact.
- Linked sources are read only, show the destination and reason, and create no separate price/claim row or attention task. The destination retains its normal QS scope/instruction/price/eligibility flow and a collapsed Related evidence group with original attachment, sender/date, reason and exact source navigation. Drawing/message statuses use the same neutral linked state. Stored associations validate project/identity, prevent chains/cycles and preserve frozen evidence across later demo photo refreshes. Malformed histories cannot revive a linked record for approval.
- New claim versions freeze related originals and linking metadata; View evidence, saved preview, CSV and PDF use that saved evidence with no second financial amount. Old snapshot shapes and exports remain unchanged.
- Validation: 56 UI tests in nine files passed (55 in the first coordinated run and the corrected integration test separately); 116 state tests across VO, links, project persistence, notifications, workflow, inbox, drawing and claim/confirmation snapshots passed. TypeScript, production build and diff whitespace checks passed. The integration test's two initial failures were test queries using region instead of form and matching text split across summary children; neither required a product-code change. Independent domain/App safety review found no concrete issues.
- Local browser: reused the existing fictional S.I.T. Plot 1 in Demo examples, added one explicitly manual follow-up photo record, and linked it to its existing unapproved platform VO. Checked required-reason validation/focus, exact source/target navigation, attention count reducing from seven to six, reload persistence, Related evidence and source read-only controls. Desktop 1440px and phone 390px layouts have no horizontal page overflow; browser errors/warnings were empty. The original S.I.T. showcase was not edited; no claim, approval or completion action was saved. No new test project was created.
- Screenshots outside the repository in the task artifacts/vo-related-evidence folder: no-target-main-showcase.png, link-form.png, linked-source.png, related-evidence.png, related-evidence-mobile.png and related-evidence-desktop.png. Left uncommitted for review; no Vercel checks, deployment or next-module changes.

## Approved Overview simplification — 26 October 2026

Implemented only the approved Overview proposal. Kept one primary Your next step action, replaced the four module cards with at most three other pending tasks, and excluded the primary record from those rows. Recent activity retains the same last three exact-record links in a disclosure that starts collapsed. Labels are larger, rows stay compact, and module navigation remains in the sidebar.

Reviewed localhost at 1440 × 900 and 390 × 844. Task rows wrap cleanly without horizontal overflow. Opened the exact W5-ST51 progress report and returned without a decision; opened the existing prepared claim and confirmed October 2026, version 2, SGD 21,969.00. Expanded and collapsed recent activity. No browser warnings or errors were observed. Desktop and mobile screenshots are saved as local task artifacts `approved-overview-desktop.png` and `approved-overview-mobile.png` outside the repository.

Validation: 21 focused navigation tests, all 358 UI tests, 12 workflow state tests, strict TypeScript and the production build passed. Tests verify the three-task limit, primary-task exclusion, exact report/VO/activity links, project isolation, empty states, default-collapsed activity and unchanged project records and saved claim evidence. No mock data, saved claims or exports were changed. Changes remain uncommitted; the user reviews Overview before work on the next module.

final result: passed

## Approved Overview removal — 26 October 2026

Removed the Overview screen, sidebar entry, Dashboard shortcut and unused view styles. Dashboard is now the default landing page. Old `#projects` and `#overview` landing links redirect to `#dashboard`; `#projects?manage=1` still opens All projects. Legacy record links with `from=overview` retain their exact record parameters and return to Dashboard. Notifications and project-list actions now use the same Dashboard destination. Task forms, drawing returns and normal monthly-claim return paths retain their existing behavior.

Checked localhost on desktop (1440 × 900) and mobile (390 × 844). The original S.I.T. showcase remains selected. Opened an old claim-status link, confirmed Prepared, October 2026, version 2 and SGD 21,969.00, then returned to Dashboard. All projects and Open showcase work. Browser warnings/errors were empty. Screenshots are saved as local task artifacts `dashboard-default-desktop.png`, `dashboard-default-top.png` and `dashboard-default-mobile.png` outside the repository.

Validation: 58 focused navigation tests, 12 workflow state tests, strict TypeScript and the production build passed. The full UI run passed 365 of 366 cases; its sole failure was an obsolete project-catalog assertion expecting the removed Overview route. Updated the two route expectations to Dashboard and reran that file: all six cases passed. No production changes followed the full run. Coverage preserves project isolation, unfinished forms, exact record links, legacy reload/return paths, mock project records and frozen saved claim evidence. Changes remain uncommitted for the user's review before the next module.

final result: passed


## Approved Dashboard simplification — 26 October 2026

Implemented the approved three-card layout: Latest claim, Extra work to review and Claim-eligible extra work. The Recent claims list shows at most three latest monthly versions with month, status, saved amount and exact-record links. Removed the Dashboard task table, status charts and duplicate VO summary/list. Pending tasks remain in the notification bell. Existing financial derivation and saved project records are unchanged; eligibility is not presented as an unclaimed or unpaid balance.

The latest saved claim may belong to an older month outside the three recent months. Its card now validates that exact saved target independently, preserving the existing saved-time ordering and monthly list ordering. Tests cover this navigation case without changing financial values.

Reviewed localhost at 1440 × 900 and 390 × 844. All three cards and the recent claim are visible on the mobile page without the previous long stack of charts and summaries. Activated the latest claim with Enter, confirmed October 2026, version 2, Prepared, SGD 21,969.00, and returned to Dashboard. Opened the notification bell: its 21 pending tasks remain available, Escape closes it and focus returns to the bell. No browser warnings or errors were observed. Screenshots are local task artifacts `simplified-dashboard-desktop.png` and `simplified-dashboard-mobile.png` outside the repository.

Validation: all 367 UI tests across 67 files, 24 Dashboard/workflow state tests, strict TypeScript and the production build passed. The nine focused Dashboard tests cover card actions, three monthly rows, unknown versus zero, price approval versus eligibility, exact claim targets, partial payments, notifications, project switching and unchanged frozen project/claim evidence. Independent read-only review found no actionable issues. Changes remain uncommitted for the user's review before moving to the next module.

final result: passed


## Approved Contract simplification — 26 October 2026

Applied only the approved Contract layout. Consolidated checked status, declared value and the S.I.T. Partial schedule label into the header; confirmation still uses the existing validation actions, and the confirmed site-update shortcut is secondary. Search stays visible, Location/Review status sit in collapsed Filters with an applied count, and unresolved items retain a visible Needs review shortcut. Five-column rows retain item/reference/location, quantity, rate, amount and a single Review/View action. CSV export joins versions and revisions under More options.

Kept the original source and zoom controls beside a compact From contract / Work-list value table. Editable fields, source recovery/fill, explicit confirmation, buffers, quantity/rate arithmetic and Included/Rate only semantics remain intact. Item details now contain the same exact related area and inbox links previously repeated in every row. Confirmed status appears once; source provenance stays available. Partial-schedule checks retain their existing neutral reconciliation and explanatory note, without forcing a complete-contract match or altering any values.

Reviewed localhost at 1440 × 900 and 390 × 844. Search/filter opening and closing, the More options menu, Enter activation of a row, exact item review and Back to work items work. The mobile work list reaches its first item substantially sooner. Fixed a mobile comparison label/amount collision with wrapping and column proportions, then recaptured it with separate, readable columns. The selected original S.I.T. project remains checked, its declared value remains S$543,887.61, and WI-001 still compares 2,088 m², S$13.50 and S$28,188.00. No decisions, extraction, revisions, progress or claim records were saved during browser checks. Browser warnings/errors were empty.

Screenshots are local task artifacts outside the repository: `simplified-contract-work-list.png`, `simplified-contract-source-comparison.png`, `simplified-contract-mobile.png` and `simplified-contract-source-mobile.png`.

Validation: all 372 UI tests across 67 files, 37 focused Contract UI tests across seven files, 54 Contract state tests, strict TypeScript and the production build passed. Coverage includes filters and unresolved discovery, source comparison, exact related links, recovery fill followed by explicit confirmation, full-schedule total review, revision reasons, isolated unfinished edits, frozen saved claim evidence and CSV. Independent read-only review found no actionable issues. Changes remain uncommitted for the user's review before the next module.

final result: passed


## Contract redundancy cleanup — 26 October 2026

Removed the confirmed Contract header's Continue to site updates button and the matching cross-module instruction in its confirmation toast. Sidebar navigation remains the module entry point. Also hid the repeated default item count when pagination already supplies the total, removed the repeated item reference from the confirmed-item footer, and shortened the partial-schedule note. Active search/filter result counts, Clear filters, unresolved-item shortcuts and the editable confirmation footer remain intact.

Retained drawing navigation, checks, source evidence, Confirm/Next actions, related links and all More options tools. No additional controls clearly qualified for removal in the read-only redundancy review. No project records, contract values, baselines, progress or saved claims were changed.

Checked localhost at 1440 × 900 and 390 × 844. The shortcut is absent, the default list remains readable, the confirmed-item footer retains its Next action and the S.I.T. partial-schedule explanation remains visible. Browser warnings/errors were empty. Screenshots are task artifacts outside the repository: `contract-cleanup-desktop.png`, `contract-cleanup-mobile.png` and `contract-cleanup-item-mobile.png`.

Validation: 19 focused Contract UI tests across three files, strict TypeScript and the production build passed. Tests preserve sidebar navigation, filtered counts, unresolved discovery, tools, notifications, explicit confirmation, total-difference review and frozen saved claim evidence. Changes remain uncommitted for review.

final result: passed


## Compact Contract checks and confirmed details — 26 October 2026

Implemented the approved compact status before confirmation: No issues found, item-review counts, Total needs review or Total difference reviewed as applicable. The status opens the existing issue list and reconciliation inline; removed the duplicate unconfirmed status badge from the header. Confirmed contracts have no inline checks section. The renamed Contract actions menu opens Contract checks in a read-only dialog, including original partial-schedule notes, current values and existing reasons. Existing item, total-difference and baseline confirmation rules and buffers remain unchanged.

Checked the existing unconfirmed UP01 project and confirmed S.I.T. project on localhost at 1440 × 900 and 390 × 844. The compact UP01 status opens its unchanged SGD 136,200.00 reconciliation; its previously corrected item stays at 1,200 m² and no baseline was confirmed. The S.I.T. dialog preserves selected total SGD 377,016.72, declared value SGD 543,887.61 and the neutral partial-schedule difference. Stacked label/value rows keep totals readable inside the narrow dialog. Opening and closing details saves nothing. Escape closes the dialog and returns focus to Contract actions. Browser warnings/errors were empty.

Screenshots are task artifacts outside the repository: `contract-checks-compact-unconfirmed.png`, `contract-checks-confirmed-list.png`, `contract-checks-confirmed-dialog.png` and `contract-checks-confirmed-mobile.png`.

Validation: all 374 UI tests across 67 files, 47 focused Contract UI tests, 54 Contract state tests, strict TypeScript and the final production build passed. Tests cover exact issue links, total-difference reason focus and confirmation, removal of inline checks after confirmation, read-only dialog contents, Escape focus, project switching, unfinished fields and frozen claim evidence. Independent read-only review found no actionable issues. No mock project records or saved claims changed. Changes remain uncommitted for review before the next module.

final result: passed


## Mighty One Contract filter layout — 26 October 2026

Source visual truth: authenticated Mighty One Products screen at one-staging.mightyjaxx.technology/products, captured before implementation as `mighty-contract-filter-reference.png` in local task artifacts outside the repository. Source pixels/CSS viewport: 1680 × 899, 1× density. Implementation: localhost Contract, same light theme with the unfiltered panel open, `contract-mighty-filter-desktop-viewport.png`, 1680 × 900 pixels/CSS at 1× density. The one-pixel viewport-height difference is immaterial. Both images were opened together in one comparison input. The different modules and record content are intentional; this is the filter pattern applied to Contract, not a clone of Mighty One's product catalog.

Full-view comparison: search sits on the left, Filter on the right, with a right-aligned floating white panel below the trigger; opening no longer pushes the work list down. The focused implementation capture `contract-mighty-filter-detail.png` makes its heading, labels, dropdowns, border and shadow readable. Mobile evidence: `contract-mighty-filter-mobile.png`, 390 × 844 pixels/CSS at 1× density. Panel bounds are 16–374 px in a 390 px viewport, and document width remains 390 px.

Fidelity surfaces: typography retains this application's shared font and field sizes, with a medium Filters heading and uppercase secondary labels. Spacing follows the source's compact search/trigger row and stacked fields; the panel is 360 px wide, bounded on mobile, with shared control heights and 20 px desktop padding. The neutral border/background/shadow follows the reference, while applied selections retain this application's blue badge/highlight. Existing Lucide search/filter/chevron icons remain sharp; no raster imagery or business records were copied. App-specific copy uses Location, Review status and Search work items, with Clear all shown only when needed. Two Contract choices replace the source's four product choices; existing single-selection semantics are intentional.

Interaction checks on localhost: W5 produces six matching S.I.T. items, a second Reviewed choice raises the badge to 2, and the nested Select does not dismiss the filter panel. Closing/reopening retains selections; Escape returns to the trigger. Clear all resets search and both choices, removes the active count and returns focus to Location. Existing unresolved-item shortcuts and project switching remain intact. No contract values, progress, source records or saved claims were saved during browser verification. Browser warnings/errors were empty.

Findings and comparison history: no actionable P0/P1/P2 design differences in the first visual comparison. The source-pattern adaptations above are intentional. A keyboard polish improvement returns focus to Location after Clear all disappears; final focused tests cover that behavior. No remaining P3 follow-ups are required for this scoped update.

Validation: 16 focused Contract navigation/checks UI tests across two files, strict TypeScript, production build and git diff checks passed. Tests cover nested dropdowns, Escape/focus return, outside-click dismissal, filter persistence/reset, project isolation and unchanged frozen claim pack/CSV. Independent read-only review found no actionable issues. Changes remain uncommitted for the user's review before the next module.

final result: passed


## Approved visible Contract filter bar — 26 October 2026

Replaced the floating panel with the user-approved visible Search, Location and Review status bar. Existing Mighty One colors, borders, typography, spacing and shadcn Select controls remain. Search sits on the left and dropdowns on the right at desktop width. A content-width container query puts Search above the two dropdowns in narrow layouts. Clear all appears only for active search/choices, clears all three and returns keyboard focus to Search. Removed the duplicated empty-results reset from Contract; Site progress retains its existing empty-state action.

Local screenshots outside the repository: `contract-visible-filters-desktop.png` (1440 px desktop width), `contract-visible-filters-mobile.png` and `contract-visible-filters-mobile-active.png` (390 × 844), and `contract-visible-filters-tablet.png` (800 px width with the expanded sidebar). Dropdown choices and labels remain readable, the work list stays visible, and shared focus styles are retained. At 390 px and 800 px, document width equals viewport width. A review found the initial viewport-based breakpoint could overflow beside the sidebar at tablet widths; the final content-width breakpoint fixes it, verified in the browser at 800 px with a 532 px filter area.

Checked immediate search, conflicting location producing zero results, persistent visible controls, a single Clear all, reset visibility/focus and mobile status selection. Original S.I.T. values remain S$543,887.61 declared and 2,088 m² / S$13.50 / S$28,188.00 for WI-001. No project records, source evidence, progress or saved claims were saved during the walkthrough. Browser warnings/errors were empty.

Validation: 17 focused Contract navigation/checks tests across two files, strict TypeScript, final production build and git diff checks passed. Tests retain combined filtering, dropdown dismissal, project-switch resets, unresolved discovery, frozen claim evidence and CSV. Independent final review passed after the responsive fix. Changes remain uncommitted for the user's review before moving to another module.

final result: passed


## Approved Drawing & areas simplification — 26 October 2026

Implemented the approved layout only in Drawing & areas. A compact searchable Site area picker replaces the large selector/browse card; pins and the picker select the same area, including unplaced areas. The plan and selected details remain side by side on desktop. Contract quantity and Quantity in this area are now visible together without editing: unknown measured allocations say Not allocated, zero contract quantities remain zero, and Included/rate-only work says Link only. Editing starts with selected items and their quantities; Add item opens searchable additional work. Alternate area names and coordinate entry stay secondary, and hidden invalid fields open and receive focus. Explicit saving, per-area buffers, decimal limits and existing allocation rules are unchanged.

Visual baseline: the user-approved review capture drawing-review-01-desktop.png (1440 × 1707 pixels at a 1440 × 900 CSS viewport). Implementation: drawing-simple-desktop.png (1440 × 1502 pixels at the same viewport), opened together in one comparison input. Both are 1× captures in the same S.I.T. project, W3-ST31 selection and Verified basis. Intentional changes reduce repeated controls and move the drawing upward while making quantities visible. Existing type, blue/neutral tokens, borders, icons and original drawing asset are retained; no new raster assets or source interpretation were introduced. The larger drawing pane and compact toolbar follow the approved layout rather than pixel-copying the prior screen.

Additional local evidence outside the repository: drawing-simple-mobile-details.png, drawing-simple-mobile-editor.png, drawing-simple-mobile-plan.png (390 × 844 CSS viewport) and drawing-simple-tablet.png (800 × 900). Mobile/tablet use Drawing / Area details tabs. Both panes stay mounted, retaining form buffers and preview state; selected pins open visible details. A review caught focus remaining in a newly hidden pane. The final implementation explicitly focuses the visible summary/editor/placement stage after selection, drag completion, editing and Move/Place; Cancel placement returns to the editor. The focus regression test and manual mobile walkthrough pass. Tablet document width equals its 800 px viewport; no overflow or unreadable quantity labels remain.

Manual localhost checks: picker search and Enter selection, unplaced BRACKET-A showing the existing 90 pc allocation against 180 pc contract quantity, selected quantities staying visible during Add item search, mobile pin selection, Move/Cancel without changing coordinates, return focus, collapsed evidence/VO tools, and navigation back to Contract. Main S.I.T. WI-001 remains 2,088 m², reported 65% and verified 50%; Monthly claims still shows October R2 Prepared, SGD 21,969.00, with the earlier version retained. No project records, quantity splits, source evidence, progress or saved claims were saved during browser verification. Console warnings/errors were empty.

Independent source review passed after the mobile focus fix. Final validation results are recorded below.

Validation: all 384 UI tests across 68 files, 53 drawing/allocation state tests, strict TypeScript, the final production build and git diff checks passed. Initial concurrent test runs hit timing limits; the unchanged tests passed in the final isolated full run, without increasing timeouts. No data or commits changed. Ready for the user's review before the next module.

final result: passed

## 2026-10-28 — Approved Site updates simplification

- Messages: compact area/summary/status rows; visible Search, Location and Review status filters; conditional Clear all restores Search focus and keeps an exact selected record open outside filters. Original message/photo or saved voice evidence precedes the match summary and explicit action. Original text, sender, attachment and transcript/correction history are retained.
- Progress: four columns remain, with a compact review status/action, independent reported/verified totals, area links and allocation breakdown. Removed the monthly-claim promotion panel. Shared button sizes are retained.
- Supervisor review: evidence first, explicit area/whole-item scope, then Confirm / Correct / Can’t verify. Only relevant fields appear, with focus on revealed controls and reason validation retained. Reject/VO remain secondary and require an explicit final action.
- Local browser checks: 1440px desktop and 390px mobile; inbox/detail return focus; Location filter and Clear all; Correct / Can’t verify / Confirm transitions without saving; saved original voice-note evidence and area-weighted totals. No horizontal page overflow, and no browser errors or warnings. Reused the existing S.I.T. showcase; no messages processed or decisions saved. Its prepared October claim remains Version 2, SGD 21,969.00, with its earlier version retained.
- Automated checks: initial focused run 31/31 passed. Full UI run exercised 390 tests in 69 files: 387 passed and three old copy assertions were updated for evidence-first labels/order. The final five affected files passed 25/25, including all three previously failing tests. TypeScript and production build passed; diff whitespace check passed. No data/state implementation or fixtures changed. The first sandboxed build stalled and was stopped; the same production build passed with local build-worker permissions.
- Screenshots: `site-updates-simplified-messages.png`, `site-updates-simplified-progress.png`, `site-updates-simplified-supervisor.png`, `site-updates-simplified-decision.png`, and mobile inbox/message/progress captures under this task's `artifacts/` folder.
- Left uncommitted for user review. No Vercel verification or deployment, and no next-module changes.


## 2026-10-28 — Approved Extra work review simplification

- Compact case list retains work, area, status and unknown/proposed/approved prices, with Search / Location / Review status and conditional Clear all. Filtering keeps the exact selected case and unfinished edits; an explicit row selection switches records.
- Original message/manual entry and photo open first. Work review groups separate scope and instruction checks, opening for new work and collapsing completed assessments. Relevant price-approval and claim-readiness controls retain the existing validation and explicit transitions. Closed cases show their saved closing note and exclusion instead of current-review prompts.
- Review actions selects Need information / Reject / Reopen without saving and reveals a reason; the explicit footer action saves. Optional notes remain available. The decision intent and reason survive record navigation in per-project/case/cycle UI buffers. Completed approval, customer confirmation, source metadata and history remain available in disclosures. Saved claim calculations, evidence and status tracking were not changed.
- Regression: final 56/56 UI tests passed across 11 files covering VO review and customer confirmation, manual entry, filter/selection behavior, attention links, S.I.T. showcase and claim workflow. Added cases protect evidence ordering, unknown versus zero price, collapsed-check error focus, explicit reasoned actions, restored action intent and legacy closing notes. TypeScript, Next.js production build and whitespace check passed. The initial focused run found a stale route-selection issue and tests needing disclosure-aware assertions; these were corrected. A manual-entry timing failure passed unchanged in the final coordinated run.
- Local browser: desktop 1440px and mobile 390px list/detail views; original evidence, compact approved and closed summaries, secondary action selection and case-return restoration without saving; note focus, keyboard Enter/Escape menu handling, Back-to-extra-work focus, and no mobile horizontal overflow. Reused the original S.I.T. showcase without creating projects or saving VO decisions. Its prepared October claim still shows Version 2, SGD 21,969.00, and one earlier version; the existing price approval remains SGD 1,800.00.
- Screenshots in this task's artifacts: vo-simple-flagged.png, vo-simple-approved.png, vo-simple-closed.png, vo-simple-mobile-list.png and vo-simple-mobile-review.png.
- Left uncommitted for review. No Vercel checks/deployment and no next-module changes.

## 2026-10-28 — Approved Monthly claims simplification

- Saved claims: compact Month / Status / Amount / Actions rows, named pencil controls for draft editing, one relevant primary action, and History containing version, saved time, earlier assessments and query responses. Mark prepared keeps its exact saved-version callback and dirty/source checks. Demo examples moved below the list, away from Start claim.
- Preparation: retained Choose work → Enter totals → Review. Selection rows are shorter; contract and eligible-VO groups stay separate. Grouped value rows align cumulative quantity/value and assessed gross, prior claimed gross, and this month's gross amount. Shared fields, cutoff/eligibility checks, undated evidence confirmation, reduction reasons, optional Claim basis/net reconciliation and explicit prior confirmation remain. Evidence opens on demand without changing inputs; final review and explicit save remain.
- Tracking: compact stages and current action form, one header Back, version/reference under Saved claim details, certified/payment totals shown when relevant with unknown distinct from zero, and demo fill as a secondary footer action. Query/revision and partial-payment behavior is unchanged; Paid remains read only.
- Local browser: existing main S.I.T. only, desktop 1440px and mobile 390px; opened preparation and final review without edits/saves, D.5 area evidence and Escape returning focus to its opener, keyboard Enter to open/close History, and exact prepared-version tracking. Mobile list and tracker document width equal 390px. Main claim remains October R2 Prepared, SGD 21,969.00, three selected items, with original R1 Draft SGD 15,894.00 under History. No projects created or records/statuses saved.
- Validation: 65/65 UI tests in 13 files covering preparation, saved-list guards, evidence, billing basis, query/revision, tracker navigation and lifecycle passed in a coordinated single-worker run. Forty claim calculation/tracking/revision/CSV-PDF snapshot state tests passed. TypeScript, production build and whitespace checks passed. Earlier competing UI runs hit timing limits; the final run passed with a 20s per-test limit. The sandboxed production build stalled and was stopped; the same build passed with local build-worker permissions. Independent read-only safety review found no regressions.
- Screenshots outside the repository in this task's artifacts folder: monthly-simple-saved.png, monthly-simple-values.png, monthly-simple-status.png and mobile saved/values/status variants. No Vercel checks or deployment. Changes left uncommitted for user review before the next module.

## 2026-10-28 — Approved showcase workflow refinements

- Added project-validated Back to message links from Contract and Extra work. The nested message → VO → Contract path returns to the same VO and original message, preserving drawing/dashboard context and per-project inbox filters. Missing or foreign source records and project switches cannot retain a misleading return. No navigation saves or processes records.
- Claim inputs now say QS assessed quantity/value to date. Area-derived item progress says Whole-item verified total, legacy gross-only basis says Before retention and tax, and completion destinations consistently say Site progress. These are presentation changes; calculations and saved evidence remain unchanged.
- Replaced the prepared-row standalone plus with labelled New version inside History and a short explanation. It only opens the existing form for the latest unissued prepared assessment; submitted/certified/paid, older and query-child versions retain their existing restrictions. Draft editing stays directly available.
- Local browser walkthrough: original S.I.T. only, desktop 1440px and mobile 390px. Verified exact message and search restoration through both Contract and VO, keyboard History expansion, New version opening without saving, and responsive labels/actions with mobile document width equal to 390px. Main saved October claim remains R2 Prepared, SGD 21,969.00, with R1 Draft SGD 15,894.00 retained. No mock records, progress, decisions, saved claims or statuses changed.
- Validation: 78/78 UI tests across 14 files and 31/31 claim state/tracking/revision/export snapshot tests passed; strict TypeScript and production build passed. Independent source safety review found no actionable issues. Tests cover nested returns, reload, foreign/missing origins, project isolation, unchanged workspace records and labelled version-action guards.
- Screenshots outside the repository in the task artifacts folder: workflow-refinements-vo-return.png, workflow-refinements-history.png, workflow-refinements-claim-labels.png, workflow-refinements-mobile-history.png and workflow-refinements-mobile-labels.png. Changes remain uncommitted for review. No Vercel check, deployment or next-module changes.

final result: passed

## 2026-10-28 — Approved Claim status balances

- Added Balance to receive (certified) using the existing exact-decimal certified-minus-paid helper. Missing payments remain Not recorded; explicit zero and signed values remain distinct. A known nonzero claimed-minus-certified value appears as Difference from claim, with neutral basis text and the saved Certification note under a compact disclosure. Paid completion says Certified amount fully paid; lifecycle, input buffers, tracking history, original assessments, mock fixtures and exports are unchanged.
- Validation: all 52 UI tests across seven files and 31 claim state/tracking/revision/export tests passed. Coverage includes partial and complete payments, a remaining claim/certification difference after certified payment, matching and unknown values, zero, above-claim certification, negative adjustments, decimal cents, project/claim navigation, note disclosure and unchanged saved project/pack/CSV. TypeScript, production build and diff whitespace checks passed. Independent read-only safety review found no concrete issues.
- Local browser: reused Claim examples (Demo), August R1 Paid at SGD 5,000.00, and the existing Claims UI walkthrough Paid assessment at SGD 15,894.00. Both retained matching original claimed/certified/paid values and now show a zero certified balance. Difference scenarios were exercised in component tests; existing browser records were not altered to manufacture one. No new projects, claims, tracking actions or mock entries were created. Returned to the original August example for review.
- Desktop 1440px and phone 390px showed readable balances with no horizontal page overflow. Browser errors/warnings were empty. Screenshots outside the repository in artifacts/claim-balance-update: paid-balance.png, paid-balance-mobile.png and paid-balance-desktop.png. Changes remain uncommitted for user review; no Vercel checks or next-module work.

final result: passed

## 2026-10-28 — Approved inbox dismissal and reopening

- Added secondary Message actions → Dismiss message and Reopen with explicit required reasons. Original messages, photos, audio/transcripts and correction histories remain intact; the latest decision and expandable history retain reviewer/time. All and Dismissed keep the original reachable. Only new unprocessed messages without an existing report, VO result or clarification thread qualify; processed records retain their existing review actions.
- Saved decisions remove and restore the same selected-project Needs attention task and inbox/sidebar counts without processing a report. Match/transcript edits block dismissal, clarification drafts retain their existing buffers, and reason forms preserve cancellation buffers by source/action. State boundaries reject stale/foreign/ambiguous decisions and invalid stored histories fail closed. Drawing history remains visible and dismissed extra-work hints leave active markers. Previous saved claim snapshots, packs, CSV exports and tracking remain unchanged.
- Validation: 26 UI tests across six files and 80 state/export tests passed, including App persistence, mandatory reasons, dismissal/reopening task counts, project isolation, direct processing guards, correction/audio evidence, reload/reset and saved-claim invariance. Strict TypeScript, production build and diff whitespace checks passed. The sandboxed build was stopped after stalling; the normal build passed with local worker permissions. Independent safety review found no remaining actionable issues.
- Local browser: reused Warehouse Extension (Demo), message WH02-WA-003. Needs attention changed 5 → 4 → 5 after reasoned dismissal/reopening; reload retained the original and decisions. No report, progress, VO or claim was created or edited, and the main S.I.T. showcase was untouched. Required-reason validation, Dismissed filter, history and cancellation passed at desktop 1440px and phone 390px, with no phone horizontal overflow. No browser warnings/errors after the completed implementation reload. Restored normal viewport and left the reopened original visible for review.
- Screenshots outside the repository in artifacts/inbox-dismissal: 01-dismissed-desktop.png, 02-reason-mobile.png and 03-reopened-history-desktop.png. Changes remain uncommitted; no Vercel check, deployment or next-module changes.

final result: passed

## 2026-10-28 — Supplied progressive-claim format with evidence appendix

- Replaced the dashboard-style claim document with a formal A4 portrait claim form: saved subcontractor heading, recipient/project/assessment details, reference, seven-column bordered schedule, saved-value reconciliation and unsigned signature/receipt areas. Current claim precedes cumulative claim as in the supplied reference. Selected contract amounts and approved VO ceilings are qualified separately from the whole contract sum; quantities, rates, physical verification and approval details remain available.
- Kept all frozen evidence after the claim summary/signatures/notes: photos, original messages, sender/date, area allocations, voice originals/reviewed transcripts, match reasons and related VO evidence. Existing View evidence and CSV actions still use the saved revision. No source customer contacts, logos, handwriting, signatures/stamps or the supplied PDF were added to the repository. No submission date or sequential claim number was invented. Financial state, assessment snapshots, progress, approvals, tracking and CSV content remain unchanged.
- Local browser: main S.I.T. saved October R2 stays Prepared at SGD 21,969.00 with four evidence references and loaded photos. Read-only evidence opens its saved original. Desktop 1440px and phone 390px checks passed; the phone document remains 390px wide and only the schedule scrolls horizontally. No save, new revision, status or report action was taken.
- Validation: 22 UI tests across six files plus 36 claim calculation/snapshot/CSV/tracking/revision tests passed. Strict TypeScript, final production build and whitespace checks passed. Independent safety review found no commercial or data-preservation issues.
- Generated six isolated mock PDF fixtures with previously approved headless Chrome: gross claim (2 pages), retention claim (2), short work claim (1), incomplete claim (1), fourteen work items plus four VOs (6), and a 45-line QS note plus 95-line message (3). Checked complete saved messages/notes, amounts, portrait orientation, project/month/reference/page numbering on every page, repeated table headers, last row with subtotal, bounds and absence of empty continuation pages. Inspected rendered pages; normal evidence stays together and long evidence flows without truncation. Reset inherited table heights and hid the redundant in-body print footer to avoid footer-only pages; page-margin references and the document status remain.
- QA renders, example PDF and screenshots remain outside the repository under artifacts/claim-format-reference. Source scanned form remains unchanged. Restored normal browser viewport and left the saved claim preview open. Changes remain uncommitted for review; no Vercel check, deployment, backend or other-module changes.

final result: passed

## 2026-10-28 — Editable printed claim details with frozen versions

- Added Edit claim details to the latest unissued saved claim preview. The compact form covers recipient company/attention/address, printed project name/code, contract and claim references, claim date and company address/registration/contact details. Optional contact sections stay collapsed; fields use shared limits, calendar/email validation and project/source-specific unfinished buffers. Cancel preserves edits and errors retain the form. Save new version creates a separate Draft; unchanged saves/replays do not duplicate it.
- The mutation clones the selected saved assessment, amounts, project metadata and evidence exactly. Older versions, their CSV/PDF metadata, tracking, original messages/photos/audio, progress, VO decisions and other projects remain unchanged. Printed codes never change internal project IDs, filenames or WhatsApp matching. Missing details stay blank, blank claim references resolve to the new system version ID, and the printed claim date never submits a claim. Issued months retain the existing query/revision path; stale, foreign, duplicate and malformed sources fail closed. Later financial/query saves inherit document details.
- Localhost browser: reused the main S.I.T. October claim, preserving R2 Prepared at SGD 21,969.00 with four saved evidence references. Saved mock recipient/company information and a printed SIT-CLAIM-01 code into R3, then exercised the native date field in R4 (28 Oct 2026); both remain Draft at the same amount with the same evidence. Reload retained the values. History still opens R2 with its original name/code/reference/date/status and no edit action on the older version. No report, approval, preparation, submission or payment action was taken; project routing and attention counts stayed unchanged.
- Responsive review passed at desktop 1440px and phone 390px. Phone dialog width and scroll width both 356px, save/cancel footer stays visible, and the body scrolls to the remaining fields. Restored the normal viewport. No browser errors or warnings after implementation.
- Validation: 37 focused UI tests across nine files and 46 state/calculation/pack/tracking/revision tests passed, including the new form/App persistence and ten document-details domain cases. Strict TypeScript, final production build and diff whitespace checks passed. Independent read-only review found no remaining isolation or workflow blocker.
- Generated four isolated two-page mock PDFs: original, edited, long addresses/references and 160-character unbroken names/references. Verified full contacts, project/month/reference/page numbering on every page, preserved amounts/messages/photos and all text within paper bounds. Inspected renders. Chrome margin boxes ignored ordinary CSS wrapping, so print-only explicit line breaks now retain full long values within the margins; normal short headers stay unchanged. QA scripts, PDFs and screenshots live outside the repository under artifacts/claim-details. Existing supplied-form work remains intact. All changes remain uncommitted for user review; no Vercel check, deployment, backend or next-module changes.

final result: passed

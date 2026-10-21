# Connected module stepper — design QA

Date: 22 October 2026

## Scope and source

User-selected visual: https://cdn.dribbble.com/userupload/16610681/file/original-c516081597785b33819a24a21302b624.jpg?resize=400x0

Approved adaptation: one white strip, thin connections, numbered markers, the existing blue active state and small selected-project statuses. Keep the Overview and existing navigation behavior. Earlier modules are not automatically completed.

This is an adaptation of the connected-stepper pattern, not a reproduction of the reference's perspective, decorative background, teal palette or illustrative completed-step states.

## Captured evidence

Evidence remains outside the application and public assets, under `../../work/connected-stepper/`:

- Source visual truth: `reference.png`, 400 × 300 pixels, captured from the supplied image at its displayed native size.
- Implementation: `desktop.png`, 1280 × 800 pixels and CSS viewport; Contract selected. Focused strip: `desktop-strip.png`, 976 × 108 pixels.
- Full-view comparison: `comparison-full.png`, source and full implementation together at native pixel sizes.
- Focused comparison: `comparison.png`, source above and implementation strip below at native pixel sizes.
- Mobile: `mobile.png`, 390 × 844 pixels and CSS viewport; Site updates selected. Also checked at 320 × 740.
- Overview: `overview.png`, 1280 × 800, preserving the existing four workflow cards and next-task panel.

The comparison captures use an effective one image pixel per CSS pixel, with no resampling. The source is a small perspective composition, so the comparison evaluates the approved component structure and states rather than a pixel overlay or exact typography reconstruction.

## Findings and required fidelity surfaces

No actionable P0, P1 or P2 findings remain in the approved scope.

- Fonts and typography: preserved the app's Inter family, plain module labels and subordinate status text. Labels and statuses wrap without truncation on small screens.
- Spacing and layout: a single rounded white container replaces separate header cards. All four numbered markers share a baseline; thin lines connect adjacent steps. Desktop and mobile remain horizontal without page overflow.
- Colors and tokens: the current marker and label use the existing blue theme; other markers and connections remain neutral. Visiting a later module does not add completion ticks.
- Image quality and assets: no new raster assets are needed for the functional stepper. The reference's decorative background is outside the approved scope; the existing contract images and demo photos are unchanged.
- Copy and content: four actual module names and the same derived project statuses used by Overview. No counts, descriptions or new workflow requirements were added to the strip.

## Interaction and regression checks

- Keyboard Tab focus is visible; Enter navigates to the selected module.
- The active module retains its exact record link; grouped drawing, progress, preview and tracking views retain their parent step.
- Project switching refreshes statuses without changing saved records; unfinished form buffers are preserved.
- Overview keeps its original workflow cards and does not gain the module stepper.
- The stepper remains outside the claim document and hidden when printing.
- Browser walkthrough: no console errors observed.
- Existing UI suite: 69 passed. Workflow, form-buffer and claim-pack state checks: 24 passed.
- Production build and whitespace check passed.

## Comparison history and checklist

The first normalized full-view and focused comparisons found no actionable P0/P1/P2 differences. Intentional adaptations are recorded above. No further visual fixes were required after these comparisons.

- [x] Inspect supplied reference and combined comparisons.
- [x] Verify desktop, mobile, active state and keyboard navigation.
- [x] Preserve Overview, project data, unsaved forms and saved claims.
- [x] Run relevant checks and production build.

Follow-up polish: none required for this scope. Screenshot review does not establish full accessibility conformance.

final result: passed

# Claim & VO prototype

A frontend-only construction workflow demo built with React and Vite. It includes project workspaces, contract review, completion tracking, mock WhatsApp processing and QS variation review.

All seeded projects, parties, schedule values, site activity and approvals in this public repository are fictional. The generated photos illustrate the workflow; they are not evidence from an actual construction project. No uploaded contract pages, commercial records or drawings are included.

## Run

Use Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The modules use these routes:

- `#projects` — create and select project workspaces
- `#contract` — review illustrative schedule values and confirm a baseline
- `#completion` — review cumulative reported and verified physical progress
- `#whatsapp` — process mock worker messages and generated photos
- `#vo` — assess flagged extra work and track local approval decisions

## Demo walkthrough

1. Select **Campus Scaffold (Demo)**. Review WI-001's simulated extraction mismatch: 2,800 m² was read, while the fictional reference quantity is 2,000 m². Use the reference value, confirm the item and confirm the baseline.
2. Open **WhatsApp processing** and process the WI-001 photo message. Reported total changes to 65%; verified progress stays at 25% until reviewed.
3. Review and verify the report. Cumulative percentages replace the total; they are not added together. Replay the event to see duplicate prevention.
4. Process the extra-platform message. In **VO review**, inspect the original message/photo, save a scope assessment and instruction reference, then mark awaiting approval.
5. Record a fictional approved value, approver and reference, or reject with a reason. Requests for information and reopening also retain a decision history.
6. Switch to **Warehouse Extension (Demo)**. Its schedule, messages, progress and variation records remain separate. New projects start empty.

## Checks

```bash
npm run build
npm run test:projects
npm run test:whatsapp
npm run test:vo
npm run test:sites
```

The build prepares `dist/client`, `dist/server/index.js` and `dist/.openai/hosting.json`. The hosting tests validate the static hosting shell. Project, WhatsApp and VO tests validate local state transitions, isolation, migration and reset behavior.

## Limits

- There is no backend, production authentication, live WhatsApp integration or AI extraction.
- Interpreted message fields are predefined fixtures. Uploading a PDF opens a browser-local preview; it does not extract or replace the seeded schedule.
- Browser `localStorage` retains demo changes on the same origin. It does not provide access control, server sync or a durable audit service.
- Physical completion does not automatically establish a claim amount. VO approval is recorded locally and does not submit a claim, certify payment or change contract totals.
- The illustrative scaffold rates bundle several activities; they must not be multiplied by duration as a billing rule.
- Reset restores only the selected project's seed. Existing data migrates between supported local storage versions.

Generated photo files and their prompts are documented in [public/assets/DEMO-PHOTOS.md](public/assets/DEMO-PHOTOS.md).

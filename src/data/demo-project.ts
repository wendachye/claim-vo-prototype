import type { Project, ProjectValues } from "../types/domain";
import { createProject, seedWorkspace } from './projects.ts';

const clone = <T,>(value: T): T => structuredClone(value);

function localDay(now: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// A separate, entirely fictional starting point for testing the complete UI.
// It does not import a PDF or copy any existing browser-edited project.
export function createDemoProject(values: ProjectValues, now = new Date()): Project {
  const project = createProject(values);
  const sample = seedWorkspace().projects.find((entry) => entry.id === 'WH02')!;
  const day = localDay(now);
  const sourceItems = clone(sample.sourceItems).map((item) => ({ ...item, reported: 0, verified: 0 }));
  const items = clone(sourceItems);
  const first = items.find((item) => item.id === 'WI-001')!;
  first.needsReview = true;
  first.rawExtractedQuantity = 1320;
  const messages = (sample.whatsappMessages || []).map((message) => {
    const { reportId, processedAt, ...fresh } = clone(message);
    const time = message.date.match(/T(\d{2}:\d{2}:\d{2})/)?.[1] || '09:00:00';
    return {
      ...fresh,
      id: `${project.id}-WA-${message.id.split('-WA-')[1]}`,
      projectId: project.id,
      projectCode: project.code,
      text: message.text.replaceAll(sample.code, project.code),
      date: `${day}T${time}+08:00`,
      status: 'new',
    };
  });
  const workflow = {
    sourceItems, items, reports: [], history: [], baselines: [], voReviews: [], claimDrafts: [],
    locked: false, version: 1, whatsappMessages: messages,
  };
  return {
    ...project,
    description: project.description || 'Fictional warehouse project for a complete prototype walkthrough.',
    demoTemplate: 'warehouse',
    contract: {
      ...clone(sample.contract),
      id: project.id,
      name: project.name,
      projectName: project.name,
      reference: `${project.code}-DEMO-SCHEDULE`,
      date: day,
      dateLabel: new Date(`${day}T12:00:00+08:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }),
      currency: project.contract.currency || sample.contract.currency,
      subcontractor: project.contract.subcontractor || sample.contract.subcontractor,
      sourceFilename: `${project.name} — fictional sample schedule`,
      sampleNote: '6 invented work items and 4 mock messages. Start by checking the highlighted quantity.',
      demoNotice: 'Fictional walkthrough data only. No PDF extraction, AI or live WhatsApp service is connected.',
    },
    ...workflow,
    seed: clone(workflow),
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { getWorkItemMessageSample, getWorkItemSiteMessage } from '../src/data/contract-work-links.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getDrawingMapping, saveAreaMapping } from '../src/data/drawing-mapping.ts';

const now = new Date('2026-10-21T13:00:00Z');
const create = () => createSITContractDemo({ code: 'SIT-LINK01', name: 'S.I.T. linked workflow' }, now);
const message = (id, values = {}) => ({ id, kind: 'progress', itemId: 'WI-001', date: '2026-10-21T10:00:00Z', text: 'Saved site update', ...values });
const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

test('S.I.T. shortcuts select the latest real inbox progress and retain exact source row references in the sample', () => {
  const project = freeze(create());
  const selected = getWorkItemSiteMessage(project, 'WI-001');
  assert.equal(selected, project.whatsappMessages.find((entry) => entry.id.endsWith('-003')));
  assert.equal(selected.completion, 65);
  const sample = getWorkItemMessageSample(project, 'WI-001');
  const item = project.items.find((entry) => entry.id === 'WI-001');
  assert.ok(sample.includes(`${project.code} | W3 | Area W3-ST31 | WI-001`));
  assert.ok(sample.includes(`Contract ref: ${item.ref}`));
  assert.ok(sample.includes(item.description));
  assert.ok(sample.includes('COMPLETE=65% TOTAL'));
  assert.ok(sample.endsWith('Attach a site photo.'));
  assert.doesNotMatch(sample, /2088|13\.5|543887|1,044|15894/);
});

test('canonical paired reports determine the item rather than a changed inbox association', () => {
  const project = create();
  project.whatsappMessages = [message('PAIRED', { reportId: 'R1', itemId: 'WI-002' }), message('DIRECT', { itemId: 'WI-002', date: '2026-10-20T10:00:00Z' })];
  project.reports = [{ id: 'R1', projectId: project.id, projectCode: project.code, itemId: 'WI-001', vo: false }];
  const before = structuredClone(project);
  assert.equal(getWorkItemSiteMessage(project, 'WI-001'), project.whatsappMessages[0]);
  assert.equal(getWorkItemSiteMessage(project, 'WI-002'), project.whatsappMessages[1]);
  delete project.whatsappMessages[0].reportId;
  project.reports[0].sourceMessageId = 'PAIRED';
  assert.equal(getWorkItemSiteMessage(project, 'WI-001'), project.whatsappMessages[0]);
  project.whatsappMessages[0].reportId = 'R1';
  delete project.reports[0].sourceMessageId;
  assert.deepEqual(project, before);
});

test('VOs and area-only messages never become a work item progress shortcut', () => {
  const project = create();
  project.whatsappMessages = [
    message('AREA', { itemId: null, area: 'Area W3-ST31' }),
    message('VO', { kind: 'vo', itemId: 'WI-001', area: 'Area W3-ST31' }),
    message('PAIRED-VO', { itemId: 'WI-001', reportId: 'VO-REPORT' }),
    message('UNCLEAR', { kind: 'clarification', itemId: 'WI-001' }),
  ];
  project.reports = [{ id: 'VO-REPORT', projectId: project.id, itemId: 'WI-001', vo: true }];
  assert.equal(getWorkItemSiteMessage(project, 'WI-001'), null);
});

test('foreign messages, reports and items cannot link across projects even when their work IDs overlap', () => {
  const project = create();
  project.whatsappMessages = [
    message('FOREIGN-ID', { projectId: 'OTHER', projectCode: project.code }),
    message('FOREIGN-CODE', { projectId: project.id, projectCode: 'OTHER' }),
    message('FOREIGN-REPORT', { itemId: 'WI-002', reportId: 'FOREIGN-R1' }),
    message('LOCAL', { projectId: project.id, projectCode: ` ${project.code.toLowerCase()} `, date: '2026-10-20T10:00:00Z' }),
  ];
  project.reports = [{ id: 'FOREIGN-R1', projectId: 'OTHER', itemId: 'WI-001', vo: false }];
  assert.equal(getWorkItemSiteMessage(project, 'WI-001'), project.whatsappMessages[3]);
  project.whatsappMessages.pop();
  assert.equal(getWorkItemSiteMessage(project, 'WI-001'), null);
  project.items[0].projectId = 'OTHER';
  assert.equal(getWorkItemSiteMessage(project, 'WI-001'), null);
  assert.equal(getWorkItemMessageSample(project, 'WI-001'), null);
  assert.equal(getWorkItemSiteMessage(project, 'FOREIGN-ITEM'), null);
  assert.equal(getWorkItemMessageSample(project, 'FOREIGN-ITEM'), null);
});

test('the latest dated message wins while equal or missing dates retain their inbox order', () => {
  const project = create();
  project.reports = [];
  project.whatsappMessages = [
    message('BAD-DATE', { date: 'not a date' }),
    message('OLDER', { date: '2026-10-20T10:00:00Z' }),
    message('NEWER'), message('SAME-DATE'),
  ];
  const before = structuredClone(project);
  assert.equal(getWorkItemSiteMessage(project, 'WI-001').id, 'NEWER');
  assert.deepEqual(project, before);
  project.whatsappMessages = [message('FIRST', { date: '' }), message('SECOND', { date: 'not a date' })];
  assert.equal(getWorkItemSiteMessage(project, 'WI-001').id, 'FIRST');
});

test('report-only or missing inbox records do not invent an original WhatsApp link', () => {
  const project = create();
  project.whatsappMessages = [];
  assert.ok(project.reports.some((entry) => entry.itemId === 'WI-001'));
  assert.equal(getWorkItemSiteMessage(project, 'WI-001'), null);
  delete project.whatsappMessages;
  project.id = 'SIT01';
  project.code = 'SIT01';
  assert.equal(getWorkItemSiteMessage(project, 'WI-001'), null);
  assert.equal(getWorkItemSiteMessage(null, 'WI-001'), null);
  assert.equal(getWorkItemMessageSample(null, 'WI-001'), null);
});

test('message samples keep zero distinct from unknown and never derive quantities or money', () => {
  const project = create();
  const item = project.items[0];
  item.reported = 0;
  assert.match(getWorkItemMessageSample(project, item.id), /COMPLETE=0% TOTAL/);
  item.reported = 100;
  assert.match(getWorkItemMessageSample(project, item.id), /COMPLETE=100% TOTAL/);
  for (const unknown of [null, undefined, '', '0', NaN, Infinity, -1, 101]) {
    item.reported = unknown;
    assert.match(getWorkItemMessageSample(project, item.id), /COMPLETE=\[total %\] TOTAL/);
  }
  for (const pricingType of ['included', 'rateOnly']) {
    item.pricingType = pricingType;
    assert.equal(getWorkItemMessageSample(project, item.id), null);
  }
});

test('samples use current work descriptions and saved mapped areas, with an explicit unmapped placeholder', () => {
  let project = create();
  const originalArea = getDrawingMapping(project).areas[0];
  project = saveAreaMapping(project, { ...originalArea, areaId: originalArea.id, code: 'UPDATED', workItemIds: ['WI-001'] }, now).project;
  project.items[0].ref = 'A.1 / 1a — reviewed';
  project.items[0].description = 'User-reviewed scaffold work';
  project.items[0].location = 'Reviewed W3 location';
  const before = structuredClone(project);
  const sample = getWorkItemMessageSample(freeze(project), 'WI-001');
  assert.match(sample, /Reviewed W3 location \| Area UPDATED/);
  assert.ok(sample.includes(`Contract ref: ${project.items[0].ref}`));
  assert.ok(sample.includes('User-reviewed scaffold work'));
  assert.deepEqual(project, before);
  const newlyMapped = getWorkItemMessageSample(project, 'WI-003');
  assert.ok(newlyMapped.includes('Area W3-ST36'));
  const siteMessage = getWorkItemSiteMessage(project, 'WI-003');
  assert.equal(siteMessage, project.whatsappMessages.find(message => message.id === `${project.id}-SIT-AREA-W3-ST36-PROGRESS`));
  assert.equal(siteMessage.status, 'new');
  const unmappedProject = structuredClone(project);
  unmappedProject.drawingMapping.areas = unmappedProject.drawingMapping.areas.filter(area => !area.workItemIds.includes('WI-003'));
  const unmapped = getWorkItemMessageSample(freeze(unmappedProject), 'WI-003');
  assert.ok(unmapped.includes('[confirm area]'));
  assert.ok(unmapped.includes(project.items.find((item) => item.id === 'WI-003').ref));
  assert.ok(!unmapped.includes('Area B'));
});

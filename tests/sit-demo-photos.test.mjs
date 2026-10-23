import assert from 'node:assert/strict';
import test from 'node:test';
import { createProvidedContractDemo, createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getSITDemoPhoto, getSITDemoPhotoUpdate, refreshSITDemoPhotos } from '../src/data/sit-demo-photos.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getAreaEvidence, resolveAreaEvidenceSource } from '../src/data/drawing-evidence.ts';
import { getDrawingMapping } from '../src/data/drawing-mapping.ts';

const now = new Date('2026-10-21T13:00:00Z');
const create = (code = 'SIT-PHOTO01') => createSITContractDemo({ code, name: 'S.I.T. photo showcase' }, now);
const genericAlt = 'Generated construction illustration used as a demo site photo; not project evidence.';
const legacy = () => {
  const project = create();
  project.whatsappMessages = project.whatsappMessages.map((message) => {
    const { demoPhotoHistory, ...rest } = message;
    return { ...rest, photo: message.kind === 'vo' ? '/assets/demo-platform.jpg' : '/assets/demo-scaffold.jpg', photoAlt: genericAlt };
  });
  project.reports = project.reports.map((report) => {
    const message = project.whatsappMessages.find((entry) => entry.id === report.sourceMessageId);
    const { demoPhotoHistory, ...rest } = report;
    return { ...rest, photo: message.photo, photoAlt: message.photoAlt };
  });
  return project;
};
const withoutPhoto = ({ photo, photoAlt, demoPhotoHistory, ...rest }) => rest;
const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

test('each of the 18 S.I.T. messages has a distinct work-related generated illustration', () => {
  const project = create();
  const photos = project.whatsappMessages.map((message) => getSITDemoPhoto(project, message));
  assert.equal(photos.filter(Boolean).length, 18);
  assert.equal(new Set(photos.map((entry) => entry.photo)).size, 18);
  for (const photo of photos) {
    assert.match(photo.photo, /^\/assets\/demo-[a-z0-9-]+\.jpg$/);
    assert.match(photo.photoAlt, /^Generated demo illustration of .+; not project evidence\.$/);
  }
  const photoFor = (suffix) => getSITDemoPhoto(project, project.whatsappMessages.find((message) => message.id.endsWith(suffix)));
  assert.match(photoFor('CASE-WA-008').photo, /safety-adjustment/);
  assert.match(photoFor('CASE-WA-008').photoAlt, /guardrail.*bracing/);
  assert.match(photoFor('W3-COLUMNS-PROGRESS').photoAlt, /circular-column/i);
  assert.match(photoFor('W3-AMPH-A-PROGRESS').photoAlt, /amphitheatre/);
  assert.match(photoFor('W5-AMPH-AB-PROGRESS').photoAlt, /amphitheatre/);
  assert.notEqual(photoFor('W5-ESCALATOR-PROGRESS').photo, photoFor('W5-ESCALATOR-VO-QUERY').photo);
  assert.notEqual(photoFor('W3-COLUMNS-PROGRESS').photo, photoFor('W3-COLUMNS-VO-QUERY').photo);
});

test('catalogue lookup works before a newly constructed message enters the inbox', () => {
  const project = create();
  const message = project.whatsappMessages.find((entry) => entry.id.includes('W3-AMPH-A-PROGRESS'));
  const copy = { ...project, whatsappMessages: project.whatsappMessages.filter((entry) => entry.id !== message.id) };
  assert.ok(getSITDemoPhoto(copy, message));
  assert.deepEqual(getSITDemoPhoto(copy, message), getSITDemoPhoto(project, message));
});

test('explicit refresh archives old photos and preserves text, financial records, progress and snapshots', () => {
  const project = legacy();
  project.items[0].quantity = 2999;
  project.items[0].rate = 20;
  project.reports[0].customMetadata = { retained: true };
  const before = structuredClone(project);
  freeze(project);
  const preview = getSITDemoPhotoUpdate(project);
  assert.equal(preview.available, true);
  assert.equal(preview.messageCount, 18);
  assert.equal(preview.reportCount, 7);
  const result = refreshSITDemoPhotos(project, now);
  assert.equal(result.outcome, 'updated');
  assert.deepEqual(project, before);
  for (const [field, value] of Object.entries(before)) {
    if (!['whatsappMessages', 'reports', 'history'].includes(field)) assert.deepEqual(result.project[field], value, field);
  }
  for (const field of ['whatsappMessages', 'reports']) {
    assert.deepEqual(result.project[field].map(withoutPhoto), before[field].map(withoutPhoto));
    result.project[field].forEach((record, index) => {
      assert.deepEqual(record.demoPhotoHistory.at(-1), {
        photo: before[field][index].photo, photoAlt: before[field][index].photoAlt,
        replacedAt: now.toISOString(), reason: 'User-requested replacement with a distinct work-related generated demo illustration.',
      });
    });
  }
  assert.deepEqual(result.project.history.slice(1), before.history);
  assert.equal(result.project.claimDrafts[0].snapshot.totals.currentValue, 15894);
});

test('paired progress and VO evidence stays consistent across inbox, reports and area navigation', () => {
  let project = legacy();
  const message = project.whatsappMessages.find((entry) => entry.id.endsWith('W5-ESCALATOR-PROGRESS'));
  project = processWhatsAppMessage(project, message.id).project;
  const frozenClaim = structuredClone(project.claimDrafts);
  const result = refreshSITDemoPhotos(project, now);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.reportCount, 8);
  for (const report of result.project.reports) {
    const paired = result.project.whatsappMessages.find((entry) => entry.id === report.sourceMessageId);
    assert.equal(report.photo, paired.photo);
    assert.equal(report.photoAlt, paired.photoAlt);
  }
  const area = getDrawingMapping(result.project).areas.find((entry) => entry.code === 'W5-ESCALATOR');
  const evidence = getAreaEvidence(result.project, area.id).entries.find((entry) => entry.messageId === message.id);
  assert.equal(evidence.photo, getSITDemoPhoto(result.project, message).photo);
  assert.ok(resolveAreaEvidenceSource(result.project, area.id, evidence.id));
  assert.deepEqual(result.project.claimDrafts, frozenClaim);
  assert.equal(result.project.items.find((entry) => entry.id === 'WI-007').reported, 60);
  assert.equal(result.project.items.find((entry) => entry.id === 'WI-007').verified, 0);
});

test('a user attachment in either half of a saved pair prevents replacement of both halves', () => {
  for (const side of ['message', 'report']) {
    const project = legacy();
    const message = project.whatsappMessages[0], report = project.reports.find((entry) => entry.sourceMessageId === message.id);
    const target = side === 'message' ? message : report;
    target.photo = 'data:image/jpeg;base64,USERATTACHMENT';
    target.photoAlt = 'Uploaded worker photo';
    const before = structuredClone(project);
    const result = refreshSITDemoPhotos(project, now);
    assert.equal(result.outcome, 'updated');
    assert.deepEqual(result.project.whatsappMessages.find((entry) => entry.id === message.id), before.whatsappMessages.find((entry) => entry.id === message.id));
    assert.deepEqual(result.project.reports.find((entry) => entry.id === report.id), before.reports.find((entry) => entry.id === report.id));
    assert.ok(result.skipped.some((entry) => entry.messageId === message.id));
  }
});

test('edited scope, mismatched reports and unknown fixtures retain their original photos', () => {
  const project = legacy();
  project.items.find((entry) => entry.id === 'WI-003').description = 'User corrected scope';
  project.reports[0].message = 'A corrected original report';
  const unknown = { ...project.whatsappMessages[0], id: `${project.id}-USER-MESSAGE`, reportId: undefined };
  project.whatsappMessages.push(unknown);
  const before = structuredClone(project);
  const result = refreshSITDemoPhotos(project, now);
  for (const message of before.whatsappMessages.filter((entry) => entry.itemId === 'WI-003' || entry.id === unknown.id || entry.id === before.whatsappMessages[0].id)) {
    assert.deepEqual(result.project.whatsappMessages.find((entry) => entry.id === message.id), message);
  }
  assert.deepEqual(result.project.reports[0], before.reports[0]);
  assert.equal(getSITDemoPhoto(project, unknown), null);
});

test('source shape and project boundaries reject altered fixtures and foreign workspaces', () => {
  const project = legacy(), message = project.whatsappMessages[0];
  for (const changed of [
    { ...message, projectId: 'OTHER' }, { ...message, projectCode: 'OTHER' },
    { ...message, kind: 'vo' }, { ...message, itemId: 'WI-002' },
    { ...message, area: 'Area W5-EAST' }, { ...message, location: 'W5' },
    { ...message, text: 'User-supplied unrelated message' },
  ]) assert.equal(getSITDemoPhoto(project, changed), null);
  for (const changed of [
    { ...project, contract: { ...project.contract, sourceProfile: 'other' } },
    { ...project, reports: [{ ...project.reports[0], projectId: 'OTHER' }] },
    { ...project, whatsappMessages: [...project.whatsappMessages, project.whatsappMessages[0]] },
    createProvidedContractDemo({ code: 'CAMPUS-PHOTO', name: 'Fictional campus' }, now),
  ]) {
    const before = structuredClone(changed);
    const result = refreshSITDemoPhotos(changed, now);
    assert.equal(result.outcome, 'unavailable');
    assert.equal(result.project, changed);
    assert.deepEqual(changed, before);
  }
});

test('refresh is idempotent, retains earlier photo history and never creates reports or VO decisions', () => {
  const project = legacy();
  project.whatsappMessages[0].demoPhotoHistory = [{ photo: '/assets/older-generated-example.jpg', note: 'Retained history' }];
  const result = refreshSITDemoPhotos(project, now);
  assert.equal(result.project.whatsappMessages[0].demoPhotoHistory.length, 2);
  assert.deepEqual(result.project.whatsappMessages[0].demoPhotoHistory[0], project.whatsappMessages[0].demoPhotoHistory[0]);
  assert.equal(result.project.reports.length, project.reports.length);
  assert.deepEqual(result.project.voReviews, project.voReviews);
  const repeat = refreshSITDemoPhotos(result.project, new Date('2026-10-22T13:00:00Z'));
  assert.equal(repeat.outcome, 'unchanged');
  assert.equal(repeat.project, result.project);
  assert.equal(repeat.messageCount, 0);
  assert.equal(repeat.reportCount, 0);
});

test('invalid dates leave the original records and photo paths intact', () => {
  for (const value of [new Date('invalid'), Symbol('invalid'), NaN]) {
    const project = legacy(), before = structuredClone(project);
    const result = refreshSITDemoPhotos(project, value);
    assert.equal(result.outcome, 'unavailable');
    assert.equal(result.project, project);
    assert.deepEqual(project, before);
  }
});

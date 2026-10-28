import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDailyKPIMessage } from '../src/data/daily-kpi-message.ts';

test('daily erection log retains manpower and dimensions without calculating quantities', () => {
  const source = '27/10/26 - TUESDAY\n\nWIP-01\n\nGKH(03man)\nPA-05 -ERECTION\n4*1*7\n\nMaterials lower down\n\nJV(04man) KPI\n\nTotal (07man)\n\nPA-06 modify pipe 27m height';
  const report = parseDailyKPIMessage(source);
  assert.equal(report.reportedDate, '2026-10-27');
  assert.deepEqual(report.locations, ['WIP-01']);
  assert.deepEqual(report.manpower, ['GKH(03man)', 'JV(04man) KPI', 'Total (07man)']);
  assert.deepEqual(report.dimensions, ['4*1*7']);
  assert.deepEqual(report.activities, ['PA-05 -ERECTION', 'Materials lower down', 'PA-06 modify pipe 27m height']);
  assert.deepEqual(report.issues, []);
  assert.equal('completion' in report, false);
  assert.equal('quantity' in report, false);
});

test('team identifiers, explicit manpower, level and ambiguous dimension suffix stay separate', () => {
  const report = parseDailyKPIMessage('Date:-26/10/26\nKPI\nTeam:-15\n3man\nErection:-\nLevel6:-\n14 x 4.5 x 4 T\n1man support platform remove modification work\nHrs:8:00 to 19:00hrs');
  assert.equal(report.reportedDate, '2026-10-26');
  assert.deepEqual(report.teams, ['Team:-15']);
  assert.deepEqual(report.manpower, ['3man', '1man support platform remove modification work']);
  assert.deepEqual(report.locations, ['Level6']);
  assert.deepEqual(report.dimensions, ['14 x 4.5 x 4 T']);
  assert.deepEqual(report.workingHours, ['Hrs:8:00 to 19:00hrs']);
  assert.ok(report.activities.includes('1man support platform remove modification work'));
});

test('hoisting log preserves reported location, team IDs, time and delay remarks', () => {
  const report = parseDailyKPIMessage('26/10/26 (Monday)\nDP01\nT11,13,20 KPI\n(WDP-01 Wetwell 1)\n20×1×1\n12PM to 1PM hoisting.\nAfternoon no materials lower down due to Crane break down');
  assert.equal(report.reportedDate, '2026-10-26');
  assert.deepEqual(report.locations, ['DP01', 'WDP-01 Wetwell 1']);
  assert.deepEqual(report.teams, ['T11,13,20 KPI']);
  assert.deepEqual(report.manpower, []);
  assert.deepEqual(report.dimensions, ['20×1×1']);
  assert.deepEqual(report.workingHours, ['12PM to 1PM hoisting.']);
  assert.deepEqual(report.remarks, ['Afternoon no materials lower down due to Crane break down']);
});

test('invalid or conflicting report dates remain unknown rather than rolling over or choosing one', () => {
  for (const invalid of ['31/02/26', '29/02/25', '00/10/26', '26/13/26']) {
    const report = parseDailyKPIMessage(`${invalid}\nDP01\nKPI\n3man\n4*1*7`);
    assert.equal(report.reportedDate, null);
    assert.match(report.issues.join(' '), /invalid calendar date/);
  }
  const conflicting = parseDailyKPIMessage('26/10/26\n27/10/26\nKPI\n3man\n4*1*7');
  assert.equal(conflicting.reportedDate, null);
  assert.match(conflicting.issues.join(' '), /different dates/);
  assert.equal(parseDailyKPIMessage('29/02/2024\nKPI\n3man').reportedDate, '2024-02-29');
  assert.equal(parseDailyKPIMessage('26/10/26\n26/10/2026\nKPI\n3man').reportedDate, '2026-10-26');
});

test('missing date is explicit and unknown lines stay as reported remarks', () => {
  const report = parseDailyKPIMessage('Daily KPI updates\nLocation: Bay A west face\nTeam:-15\n3man\n4 x 1 x 7\nAwait supervisor review');
  assert.equal(report.reportedDate, null);
  assert.match(report.issues.join(' '), /report date is not stated/);
  assert.deepEqual(report.locations, ['Bay A west face']);
  assert.deepEqual(report.remarks, ['Await supervisor review']);
});

test('ordinary text, date-only input, unsupported text and malformed input are not presented as a parsed daily log', () => {
  for (const input of ['', 'Hello, please check the work.', '26/10/26', '26/10/26\nPlease confirm receipt.', 'KPI', '4 x 1 x 7', null,
    '26/10/26\nKPI\n3man\u0000', '26/10/26\nKPI\n3man\n' + 'x'.repeat(4000)]) {
    assert.equal(parseDailyKPIMessage(input), null);
  }
});

test('reported zero manpower stays a string; no total or unit is invented', () => {
  const report = parseDailyKPIMessage('Date: 26/10/2026\nLocation: DP01\nKPI\n0man\nTotal (0man)\n20 x 1 x 1');
  assert.deepEqual(report.manpower, ['0man', 'Total (0man)']);
  assert.deepEqual(report.dimensions, ['20 x 1 x 1']);
  assert.deepEqual(Object.keys(report).sort(), ['reportedDate', 'locations', 'teams', 'manpower', 'activities', 'dimensions', 'workingHours', 'remarks', 'issues'].sort());
});

test('cumulative formatted messages cannot be reclassified by a daily KPI note', () => {
  const dailyNote = '27/10/26\nKPI\n3man\n4*1*7';
  for (const source of [
    `DEMO01 | Block A | A1 | WI-001\nCOMPLETE=50% TOTAL\n${dailyNote}`,
    `DEMO01 | Block A | A1 | WI-001\n${dailyNote}`,
    `${dailyNote}\nCOMPLETE = 50% TOTAL`,
  ]) assert.equal(parseDailyKPIMessage(source), null);
});

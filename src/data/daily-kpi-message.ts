import type { DailyKPIMessage } from '../types/daily-kpi';

const dateLine = /^(?:date\s*[:=-]*\s*)?(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?:\s*(?:-\s*)?\(?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*\)?)?\s*$/i;
const dimensionLine = /(?:^|\s)\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?(?:\s|$)/i;
const manpowerLine = /\b\d+\s*(?:man|men|workers?)\b/i;
const teamLine = /^(?:team\s*[:=-]+\s*\S.*|T\d+(?:\s*,\s*\d+)*\s+KPI)\s*$/i;
const hoursLine = /^(?:hrs?|hours?|working\s+hours?)\s*[:=-]/i;
const timeRange = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?)?\s*(?:to|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?)\b/i;
const activityLine = /\b(?:erection|erect|dismantl\w*|modif\w*|hoist\w*|support\s+platform|materials?\s+lower\s+down|scaffold\w*)\b/i;
const remarkLine = /\b(?:due\s+to|break\s*down|delay\w*|no\s+materials?|remarks?|stopp\w*)\b/i;
const kpiLine = /\bKPI\b/i;
const fieldLabel = /^(?:project(?:\s+code)?|date|location|loc|area|team|manpower|hrs?|hours?|working\s+hours?)\s*[:=-]/i;

function isoDate(match: RegExpMatchArray): string | null {
  const day = Number(match[1]), month = Number(match[2]);
  const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function locationFor(line: string): string | null {
  const labelled = line.match(/^(?:location|loc|area)\s*[:=-]+\s*(.+)$/i);
  if (labelled) return labelled[1].trim() || null;
  if (/^(?!T\d)[A-Z]{1,8}-?\d+(?:-[A-Z0-9]+)*$/i.test(line)) return line;
  if (/^level\s*\d+[A-Z]?\s*[:=-]*$/i.test(line)) return line.replace(/\s*[:=-]+\s*$/, '');
  const parenthetical = line.match(/^\(([A-Z]{1,8}-?\d+[A-Z0-9-]*(?:\s+[^()]+)?)\)$/i);
  return parenthetical ? parenthetical[1] : null;
}

/**
 * Recognises a bounded daily-report layout, not arbitrary free text. Values remain
 * reported context: dimensions do not establish units, volume, completion or value;
 * team identifiers do not establish a headcount. The original text is never edited.
 */
export function parseDailyKPIMessage(rawText: string): DailyKPIMessage | null {
  if (typeof rawText !== 'string' || !rawText.trim() || rawText.length > 4000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(rawText)
    || rawText.includes('|') || /\bCOMPLETE\s*=/i.test(rawText)) return null;
  const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const dates = lines.map(line => line.match(dateLine)).filter((entry): entry is RegExpMatchArray => entry !== null);
  const hasKPI = lines.some(line => kpiLine.test(line));
  const hasActivity = lines.some(line => activityLine.test(line));
  const hasDimensions = lines.some(line => dimensionLine.test(line));
  const hasManpower = lines.some(line => manpowerLine.test(line));
  const hasLocation = lines.some(line => locationFor(line) !== null);
  // A date by itself and ordinary dated correspondence are not a daily KPI log.
  if (!(dates.length && (hasKPI || hasActivity || hasDimensions || hasManpower))
    && !(hasKPI && [hasActivity, hasDimensions, hasManpower, hasLocation].filter(Boolean).length >= 2)) return null;

  const report: DailyKPIMessage = { reportedDate: null, locations: [], teams: [], manpower: [], activities: [],
    dimensions: [], workingHours: [], remarks: [], issues: [] };
  const parsedDates = dates.map(isoDate);
  if (!dates.length) report.issues.push('The report date is not stated in a recognised day/month/year format.');
  else if (parsedDates.some(date => date === null)) report.issues.push('The report contains an invalid calendar date. Confirm the report date.');
  else if (new Set(parsedDates).size > 1) report.issues.push('The report contains different dates. Confirm which date applies.');
  else report.reportedDate = parsedDates[0];

  for (const line of lines) {
    if (dateLine.test(line) || /^(?:daily\s+)?KPI(?:\s+updates?)?\s*[:=-]*$/i.test(line)) continue;
    const location = locationFor(line);
    if (location !== null) { report.locations.push(location); continue; }
    if (teamLine.test(line)) { report.teams.push(line); continue; }
    let recognised = false;
    if (manpowerLine.test(line)) { report.manpower.push(line); recognised = true; }
    if (dimensionLine.test(line)) { report.dimensions.push(line); recognised = true; }
    if (hoursLine.test(line) || timeRange.test(line)) { report.workingHours.push(line); recognised = true; }
    if (remarkLine.test(line)) { report.remarks.push(line); recognised = true; }
    else if (activityLine.test(line)) { report.activities.push(line); recognised = true; }
    // Unrecognised lines remain visible as reported remarks; they never become a match.
    if (!recognised && !fieldLabel.test(line)) report.remarks.push(line);
  }
  return report;
}

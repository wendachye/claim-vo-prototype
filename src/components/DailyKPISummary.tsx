import { useId } from 'react';
import type { DailyKPIMessage } from '../types/daily-kpi';
import './daily-kpi-summary.css';

function ReportedLines({ values }: { values: string[] }) {
  return values.length ? values.map((entry, index) => <span key={`${index}-${entry}`}>{entry}</span>) : <span className="daily-kpi-unknown">Not stated</span>;
}

/** Read-only context from the original text; no quantity or progress is inferred. */
export function DailyKPISummary({ details }: { details: DailyKPIMessage }) {
  const headingId = useId();
  const reportedDate = details.reportedDate
    ? new Date(`${details.reportedDate}T12:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return <section className="daily-kpi-summary" aria-labelledby={headingId}>
    <h3 id={headingId}>Daily KPI details</h3>
    <dl>
      <div><dt>Reported date</dt><dd>{reportedDate || <span className="daily-kpi-unknown">Not stated</span>}</dd></div>
      <div><dt>Location</dt><dd><ReportedLines values={details.locations} /></dd></div>
      <div><dt>Team</dt><dd><ReportedLines values={details.teams} /></dd></div>
      <div><dt>Manpower</dt><dd><ReportedLines values={details.manpower} /></dd></div>
      <div className="daily-kpi-wide"><dt>Work activity</dt><dd><ReportedLines values={details.activities} /></dd></div>
      <div><dt>Reported dimensions</dt><dd><ReportedLines values={details.dimensions} /></dd></div>
      <div><dt>Working hours</dt><dd><ReportedLines values={details.workingHours} /></dd></div>
      <div className="daily-kpi-wide"><dt>Remarks</dt><dd><ReportedLines values={details.remarks} /></dd></div>
    </dl>
    <p>Dimensions are kept without assumed units or calculated quantities. Manpower and hours do not establish cumulative completion.</p>
  </section>;
}

import { ArrowUpRight, CircleAlert, Info } from 'lucide-react';
import type { MessageProgressCheck as ProgressCheck } from '../data/message-progress-check';
import { Button } from './ui';
import './message-progress-check.css';

export interface MessageProgressCheckProps {
  check: ProgressCheck;
  onOpenLatest?: () => void;
}

/** Context only: the existing processing and supervisor actions own all changes. */
export function MessageProgressCheck({ check, onOpenLatest }: MessageProgressCheckProps) {
  const repeated = check.kind === 'repeated';
  const Icon = repeated ? Info : CircleAlert;
  const scope = check.basis === 'area' ? 'This area’s cumulative total.' : 'This work item’s cumulative total.';
  let message: string;
  let guidance: string;

  if (repeated) {
    const total = check.reported ?? check.verified ?? check.completion;
    message = `Already ${check.reported === null && check.verified !== null ? 'verified' : 'reported'} at ${total}% · total stays ${total}%.`;
    guidance = `${scope} New evidence stays with this update; the percentage is not added again.`;
  } else if (check.kind === 'older') {
    message = 'A newer report exists.';
    guidance = `${scope} This older update will not replace the latest progress or source.`;
  } else if (check.isBelowVerified && check.verified !== null) {
    message = `Below the verified total of ${check.verified}%.`;
    guidance = `${scope} A supervisor must review any reduction to verified progress and record a reason.`;
  } else {
    message = check.reported !== null ? `Below the reported total of ${check.reported}%.` : 'This update reports a lower completion.';
    guidance = `${scope} Check the previous update before changing reported progress.`;
  }

  return <section className={`wa-progress-check${repeated ? ' repeated' : ' warning'}`} aria-label="Progress check">
    <div className="wa-progress-check-heading"><h3><Icon size={15} aria-hidden="true" />Progress check</h3>
      {onOpenLatest && check.latestReportId && <Button className="ghost wa-progress-check-link" icon={ArrowUpRight} onClick={() => onOpenLatest()}>View latest report</Button>}
    </div>
    <p className="wa-progress-check-message">{message}</p>
    <p className="wa-progress-check-guidance">{guidance}</p>
  </section>;
}

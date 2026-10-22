import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, FileCheck2, FileText, Flag, ListChecks, Plus, Save } from 'lucide-react';
import { buildClaimReview, countPendingClaimVOs } from '../data/claims.js';
import { getClaimRevisionContext } from '../data/claim-revisions.js';
import { readFormBuffer } from '../data/form-buffer.js';
import { useBufferedState } from './useFormBuffer.js';
import { BackButton, Badge, Button, FormActions, FormField, PageHeader, formatNumber, Checkbox, Input, Textarea } from './ui.jsx';
import { SavedClaimsList } from './SavedClaimsList.jsx';
import { amount, periodLabel, selectedRows } from './claim-view-utils.js';
import './monthly-claims.css';

const emptyAssessment = () => ({ work: {}, vos: {}, priorConfirmed: false, adjustmentReason: '', note: '' });
const currentPeriod = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; };
const dayLabel = (date) => date && !Number.isNaN(new Date(date).getTime()) ? new Date(date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not recorded';
const latestFor = (project, period) => (project.claimDrafts || []).filter((draft) => draft.period === period).sort((a, b) => b.revision - a.revision)[0];
const friendlyIssue = (issue) => issue
  .replace('Confirm the reviewed contract baseline before preparing this claim.', 'Check and confirm the contract first.')
  .replace('The current baseline was confirmed after this month’s cutoff.', 'The contract was confirmed after this month. Review the contract or choose a later month.')
  .replace('Confirm that previous claim values have been checked; blank prior values mean zero only after confirmation.', 'Confirm that you checked previous claims. Blank amounts mean zero only after confirmation.')
  .replace('Select at least one verified work item or approved VO for assessment.', 'Choose at least one work item or eligible extra work.')
  .replace('Enter the QS-assessed cumulative quantity.', 'Enter the total measured quantity.')
  .replace('Enter the QS-assessed cumulative VO value.', 'Enter the total assessed extra-work value.')
  .replace('Confirm the previous claimed value.', 'Enter the amount claimed before, or confirm that blank means zero.')
  .replace('Explain the negative adjustment before preparing.', 'Add a reason for the reduction below the amount claimed before.')
  .replace('Assessed work exceeds the baseline quantity or amount; review a variation.', 'This exceeds the contract quantity or value. Review it as extra work.')
  .replace('Assessed VO value exceeds the recorded approval.', 'This extra-work value exceeds its approval.');

export function MonthlyClaimView({ project, initialTab, initialVOId, initialDraftId, initialRevisionSourceId, onBackToVO, onBackToQuery, onBackToClaims, onBackToOverview, onSave, onSaveRevision, onPrepare, onTrack, onRevise, onOpenRevision, onOpenCompletion, onOpenVO, onOpenContract, onPreview }) {
  const requestedDrafts = (project.claimDrafts || []).filter(draft => draft.id === initialDraftId);
  const requestedDraft = requestedDrafts.length === 1 && requestedDrafts[0].projectId === project.id && requestedDrafts[0].snapshot?.projectId === project.id ? requestedDrafts[0] : null;
  const editableDraft = requestedDraft?.status === 'draft' ? requestedDraft : null;
  const revisionMode = !!initialRevisionSourceId;
  const revisionContext = revisionMode ? getClaimRevisionContext(project, initialRevisionSourceId) : null;
  const revisionStart = revisionContext?.revision || revisionContext?.source;
  const formScope = revisionMode ? `claims:revision:${initialRevisionSourceId}` : 'claims';
  const [period, setPeriod] = useBufferedState(project.id, `${formScope}:period`, () => revisionContext?.source.period || currentPeriod());
  const [forms, setForms] = useBufferedState(project.id, `${formScope}:forms`, () => revisionStart ? { [revisionStart.period]: structuredClone(revisionStart.assessment) } : {});
  const [dirtyPeriods, setDirtyPeriods] = useBufferedState(project.id, `${formScope}:dirty`, () => ({}));
  const [step, setStep] = useBufferedState(project.id, `${formScope}:step`, revisionMode ? 2 : 1);
  const [response, setResponse] = useBufferedState(project.id, `${formScope}:response`, () => revisionContext?.revision?.revisionResponse || '');
  const [mode, setMode] = useState(() => revisionMode || dirtyPeriods[period] ? 'edit' : 'history');
  const responseRef = useRef(null);
  const queryDetailsRef = useRef(null);
  const queryRowRef = useRef(null);
  const [focusQueryRow, setFocusQueryRow] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [savedRecord, setSavedRecord] = useState(null);
  const contextChoiceRef = useRef(null);
  const contextNoticeRef = useRef(null);
  const drafts = [...(project.claimDrafts || [])].sort((a, b) => b.period.localeCompare(a.period) || b.revision - a.revision);
  const groups = [...new Set(drafts.map((draft) => draft.period))].map((month) => ({ period: month, drafts: drafts.filter((draft) => draft.period === month) }));
  const assessment = forms[period] || revisionStart?.assessment || latestFor(project, period)?.assessment || emptyAssessment();
  const historyDirtyPeriods = Object.fromEntries(groups.map(group => { const sourceId = group.drafts[0].revisionOf; return [group.period, sourceId ? !!readFormBuffer(project.id, `claims:revision:${sourceId}:dirty`)?.[group.period] : !!dirtyPeriods[group.period]]; }));
  const queryTarget = revisionContext?.query;
  const isQueryRow = (row, group) => queryTarget?.targetId === row.id && queryTarget.targetType === (group === 'work' ? 'work' : 'vo');
  const querySourceRow = queryTarget?.targetType === 'work' ? revisionContext.source.snapshot.workRows?.find(row => row.id === queryTarget.targetId) : queryTarget?.targetType === 'vo' ? revisionContext.source.snapshot.voRows?.find(row => row.id === queryTarget.targetId) : null;
  const review = buildClaimReview(project, period, assessment);
  const queryCurrentRow = queryTarget?.targetType === 'work' ? review.workRows.find(row => row.id === queryTarget.targetId) : queryTarget?.targetType === 'vo' ? review.voRows.find(row => row.id === queryTarget.targetId) : null;
  const currency = review.currency || project.contract?.currency || 'SGD';
  const workRows = review.workRows.filter((row) => row.eligible);
  const voRows = review.voRows.filter((row) => row.eligible);
  const otherWorkRows = review.workRows.filter((row) => !row.eligible
    && (project.items.find((item) => item.id === row.id)?.pricingType === 'measured' || row.included));
  const otherVORows = review.voRows.filter((row) => !row.eligible);
  const priorReviewCount = [...otherWorkRows, ...otherVORows].filter((row) => row.included).length;
  const pendingVOCount = countPendingClaimVOs(review);
  const selectedWork = review.workRows.filter((row) => row.included);
  const selectedVOs = review.voRows.filter((row) => row.included);
  const saved = savedRecord ? project.claimDrafts?.find((draft) => draft.id === savedRecord.id) || savedRecord : null;
  const contractNeedsReview = !project.locked || project.items.some((row) => row.needsReview);
  const negativeAdjustment = [...selectedWork, ...selectedVOs].some((row) => row.currentValue < 0);
  const contextVO = initialVOId ? review.voRows.find((row) => row.id === initialVOId) : null;
  const contextApproved = contextVO?.status === 'approved';

  useEffect(() => { if (initialDraftId && editableDraft && !revisionMode) start(editableDraft); }, [project.id, initialDraftId]);
  useEffect(() => { if (initialTab === 'drafts' && !initialVOId && !initialDraftId && !revisionMode) { setMode('history'); setFeedback(null); } }, [initialTab, initialVOId, initialDraftId, revisionMode]);
  useEffect(() => {
    if (!initialVOId) return;
    if (contextApproved) { setMode('edit'); setStep(1); setFeedback(null); setSavedRecord(null); }
    contextNoticeRef.current?.focus({ preventScroll: true });
  }, [project.id, initialVOId, contextApproved]);
  useEffect(() => {
    if (initialVOId && mode === 'edit' && step === 1) contextNoticeRef.current?.focus({ preventScroll: true });
  }, [project.id, initialVOId, mode, step]);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [mode, step]);
  useEffect(() => { if (mode === 'history' && feedback) window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [mode, feedback]);

  useEffect(() => {
    if (!focusQueryRow || step !== 2) return;
    queryRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    queryRowRef.current?.querySelector('input')?.focus({ preventScroll: true });
    setFocusQueryRow(false);
  }, [focusQueryRow, step]);

  function changeAssessment(updater) {
    setForms((prior) => {
      const current = prior[period] || revisionStart?.assessment || latestFor(project, period)?.assessment || emptyAssessment();
      return { ...prior, [period]: updater(structuredClone(current)) };
    });
    setDirtyPeriods((prior) => ({ ...prior, [period]: true }));
    setSavedRecord(null);
    setFeedback(null);
  }
  const update = (name, value) => changeAssessment((prior) => ({ ...prior, [name]: value }));
  const updateRow = (group, id, name, value) => changeAssessment((prior) => ({ ...prior, [group]: { ...prior[group], [id]: { ...(prior[group]?.[id] || {}), [name]: value } } }));
  function start(draft) {
    if (draft?.revisionOf && onRevise) return resumeRevision(draft.revisionOf);
    const targetPeriod = draft?.period || period || currentPeriod();
    setPeriod(targetPeriod);
    if (draft) setForms((prior) => Object.hasOwn(prior, targetPeriod) ? prior : { ...prior, [targetPeriod]: structuredClone(draft.assessment) });
    setMode('edit'); setStep(draft && selectedRows(draft.snapshot).length ? 2 : 1); setFeedback(null); setSavedRecord(null);
  }
  function resumeRevision(sourceId) {
    if (sourceId !== initialRevisionSourceId) return onRevise?.(sourceId);
    setMode('edit'); setStep(2); setFeedback(null); setSavedRecord(null);
  }
  function goStep(next) { setStep(next); setFeedback(null); }
  function findContextVO() {
    contextChoiceRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    contextChoiceRef.current?.querySelector('[role="checkbox"]')?.focus({ preventScroll: true });
  }
  function save(finishLater = false) {
    if (revisionMode && !response.trim()) { if (queryDetailsRef.current) queryDetailsRef.current.open = true; setFeedback({ error: true, message: 'Add a QS response to the query before saving this revision.' }); responseRef.current?.focus(); return; }
    const result = revisionMode ? onSaveRevision?.(initialRevisionSourceId, assessment, response.trim()) : onSave?.(period, assessment);
    if (result?.outcome === 'invalid') return setFeedback({ error: true, message: friendlyIssue(result.error || 'Check the values before saving.') });
    if (!result?.draft) return;
    setSavedRecord(result.draft);
    setForms((prior) => { const next = { ...prior }; delete next[period]; return next; });
    setDirtyPeriods((prior) => ({ ...prior, [period]: false }));
    if (revisionMode && finishLater && onBackToClaims) return onBackToClaims();
    setMode(finishLater ? 'history' : 'saved');
    setFeedback(finishLater ? { message: `Draft saved for ${periodLabel(period)}. Continue when you’re ready.` } : null);
  }
  function prepare(id) {
    const result = onPrepare?.(id);
    if (result?.outcome === 'invalid') return setFeedback({ error: true, message: friendlyIssue(result.error || 'Review the saved claim before preparing it.') });
    if (result?.draft) setSavedRecord(result.draft);
    setFeedback({ message: 'Claim marked prepared. Open status tracking to record its next stage.' });
  }
  const numberInput = (group, row, name, label, suffix) => <FormField className="claim-value-field" label={label} suffix={suffix} hint={name === 'previousValue' ? 'Amount in earlier issued claims.' : 'Measured or assessed total across all months.'}><Input className="form-input" type="number" min="0" step="0.01" inputMode="decimal" aria-label={`${row.id} ${name === 'previousValue' ? 'previously claimed value' : name === 'assessedQuantity' ? 'QS cumulative quantity' : 'QS cumulative value'}`} placeholder={name === 'previousValue' && assessment.priorConfirmed ? '0.00' : name === 'assessedQuantity' ? 'Enter quantity' : 'Enter amount'} value={assessment[group]?.[row.id]?.[name] ?? ''} onChange={(event) => updateRow(group, row.id, name, event.target.value)} /></FormField>;
  const renderChoice = (row, group) => <label ref={group === 'vos' && row.id === initialVOId ? contextChoiceRef : undefined} className={`claim-choice${row.included ? ' selected' : ''}${!row.eligible ? ' needs-review' : ''}${group === 'vos' && row.id === initialVOId ? ' from-vo-review' : ''}`} key={row.id}><Checkbox aria-label={`Include ${group === 'work' ? row.id : row.reference} in claim`} checked={row.included} disabled={!row.eligible && !row.included} onChange={(event) => updateRow(group, row.id, 'include', event.target.checked)} /><div className="claim-choice-copy"><strong>{row.description || row.title}</strong><span>{row.ref || row.reference || row.id}{group === 'vos' && ` · ${row.approvalReference || 'Approval reference missing'}`}</span>{group === 'vos' && row.id === initialVOId && <Badge tone="blue">From VO review</Badge>}{!row.eligible && <p>{row.exclusionReason}{row.previousValue > 0 ? ' The amount claimed before must be reviewed.' : ''}</p>}</div><div className="claim-choice-status">{group === 'work' ? <><strong>{formatNumber(row.verified)}%</strong><span>verified</span></> : <><strong>{currency} {amount(row.approvedValue)}</strong><span>approved limit</span></>}</div></label>;
  const renderValueCard = (row, group) => <article ref={isQueryRow(row, group) ? queryRowRef : undefined} className={`claim-value-card${isQueryRow(row, group) ? ' query-target' : ''}`} key={row.id}><header><div><span>{row.ref || row.reference || row.id}{group === 'vos' && ' · Extra work'}</span><h3>{row.description || row.title}</h3></div>{!row.eligible && <Badge tone="amber">Needs review</Badge>}</header>{group === 'work' ? <p className="claim-value-basis">{formatNumber(row.verified)}% verified · Rate {currency} {amount(row.rate)} / {row.unit} · Contract quantity {formatNumber(row.contractQuantity)} {row.unit}</p> : <p className="claim-value-basis">Approved limit {currency} {amount(row.approvedValue)} · {row.approvalReference || 'Approval reference missing'}</p>}<div className="claim-value-grid">{numberInput(group, row, group === 'work' ? 'assessedQuantity' : 'assessedValue', group === 'work' ? 'Total quantity to date' : 'Total value to date', group === 'work' ? row.unit : currency)}{numberInput(group, row, 'previousValue', 'Claimed before', currency)}</div>{group === 'work' && row.requiresDateConfirmation && <label className="claim-check-label"><Checkbox aria-label={`Confirm ${row.id} evidence as of cutoff`} checked={!!assessment.work?.[row.id]?.evidenceDateConfirmed} onChange={(event) => updateRow('work', row.id, 'evidenceDateConfirmed', event.target.checked)} /><span>This verified progress applies as of {dayLabel(review.cutoff)}.<small>The original verification date is missing.</small></span></label>}<div className="claim-value-result"><span>Value to date <strong>{currency} {amount(row.cumulativeValue)}</strong></span><span>This month <strong>{currency} {amount(row.currentValue)}</strong></span></div>{!row.eligible && <p className="claim-inline-warning"><CircleAlert size={14} />{row.exclusionReason}</p>}</article>;
  const renderPriorRow = (row, group) => <article className="claim-prior-card" key={`${group}-${row.id}`}><div><strong>{row.description || row.title}</strong><span>{row.ref || row.reference || row.id}{group === 'vos' && ' · Extra work'}</span><p>{row.exclusionReason}</p>{row.included && <Badge tone="amber">Included for review</Badge>}{row.included && !(row.previousValue > 0) && <button type="button" className="claim-remove-prior" onClick={() => updateRow(group, row.id, 'include', false)}>Remove from claim</button>}</div>{numberInput(group, row, 'previousValue', 'Claimed before', currency)}</article>;


  if (initialDraftId && !editableDraft && mode !== 'saved') return <div className="claim-view"><PageHeader title="Monthly claims" onBack={onBackToOverview || onBackToClaims} backLabel={onBackToOverview ? 'Back to overview' : 'Back to monthly claims'} /><section className="claim-empty-home"><CircleAlert size={26}/><h2>Claim draft unavailable</h2><p>{requestedDraft?.status === 'prepared' ? 'This version is already prepared. Open its status to continue.' : 'Choose a saved draft from the selected project.'}</p>{requestedDraft?.status === 'prepared' && onTrack && <Button className="primary" onClick={() => onTrack(requestedDraft.id)}>Track claim status</Button>}</section></div>;

  if (revisionMode && (!revisionContext || !revisionContext.canRevise) && mode !== 'saved' && mode !== 'history') return <div className="claim-view"><PageHeader title="Claim revision" onBack={onBackToOverview || onBackToClaims} backLabel={onBackToOverview ? 'Back to overview' : 'Back to monthly claims'} /><section className="claim-empty-home"><CircleAlert size={26} /><h2>{revisionContext?.revision ? 'A revised claim is already saved' : 'Claim revision unavailable'}</h2><p>{revisionContext?.error || 'Open a submitted claim with a recorded query from this project.'}</p>{revisionContext?.revision && onOpenRevision && <Button className="primary" onClick={() => onOpenRevision(revisionContext.revision.id)}>Open revised claim</Button>}{onBackToQuery && <Button onClick={onBackToQuery}>Back to query</Button>}</section></div>;

  return <div className="claim-view">
    <PageHeader className="claim-page-header" title={mode === 'history' ? 'Monthly claims' : mode === 'saved' ? saved?.status === 'prepared' ? 'Claim prepared' : (revisionMode ? 'Claim revision saved' : 'Claim draft saved') : revisionMode ? 'Revise claim' : 'Prepare a monthly claim'} description={mode === 'history' ? 'Prepare a claim, review saved drafts and follow their status.' : mode === 'saved' ? periodLabel(saved?.period || period) : `${periodLabel(period)} · Step ${step} of 3`} onBack={onBackToOverview || (mode === 'history' ? undefined : revisionMode && onBackToClaims ? onBackToClaims : () => { setMode('history'); setFeedback(null); })} backLabel={onBackToOverview ? 'Back to overview' : 'Back to claims'} actions={mode === 'history' ? <Button className="primary" icon={Plus} onClick={() => start()}>Start claim</Button> : null} />
    {revisionMode && revisionContext && mode === 'edit' && <section className="claim-query-context" aria-label="Claim query to address"><header><div><Badge tone="amber">Query · {revisionContext.query.reference}</Badge><h2>Revising version {revisionContext.source.revision}</h2><p>The original claim stays unchanged. Save your response and reviewed values as a new version.</p></div>{onBackToQuery && <BackButton onClick={onBackToQuery}>Back to query</BackButton>}</header><details ref={queryDetailsRef} open={step !== 3 ? true : undefined}><summary>Query and QS response<span>{response.trim() ? 'Response added' : 'Response required'}</span></summary><p className="claim-query-target">{querySourceRow ? `${querySourceRow.ref || querySourceRow.reference || querySourceRow.id} · ${querySourceRow.description || querySourceRow.title}` : 'Whole claim'}</p><blockquote>{revisionContext.query.note}</blockquote>{querySourceRow && (queryCurrentRow?.included ? <Button onClick={() => { setStep(2); setFocusQueryRow(true); }}>Find queried item<ArrowRight size={14} /></Button> : <><p>This item is not included in this revision.</p><Button onClick={() => goStep(1)}>Review work selection<ArrowRight size={14} /></Button></>)}<FormField label="QS response" required hint="Explain what you changed or clarified in this revision."><Textarea ref={responseRef} rows={2} value={response} onChange={event => { setResponse(event.target.value); setDirtyPeriods(prior => ({ ...prior, [period]: true })); setFeedback(null); }} placeholder="e.g. Measurement checked and total quantity corrected…" /></FormField></details></section>}
    {initialVOId && (!contextApproved || mode === 'edit' && step === 1) && <section ref={contextNoticeRef} tabIndex={-1} className={`claim-vo-handoff${!contextApproved || !contextVO.eligible ? ' needs-review' : ''}`} aria-label="Extra work from VO review">
      <Flag size={18} /><div>{contextApproved ? <><strong>{contextVO.reference} · {contextVO.title}</strong><p>Approved limit {currency} {amount(contextVO.approvedValue)} · {contextVO.approvalReference}</p><p>{contextVO.eligible ? contextVO.included ? 'This VO is selected. Check its assessed value in Enter totals.' : 'Select this VO below, then enter the QS-assessed value.' : contextVO.exclusionReason === 'Approval is after this month’s cutoff.' ? `The approval on ${dayLabel(contextVO.approvalDate)} is after this month’s cutoff. Choose a later claim month to assess it.` : friendlyIssue(contextVO.exclusionReason)}</p></> : <><strong>Extra work unavailable</strong><p>{contextVO ? 'This extra work is not approved. Review its status before adding it to a claim.' : 'This extra-work record is no longer available in the selected project.'}</p></>}</div><div className="claim-vo-handoff-actions">{contextApproved && contextVO.eligible && <Button onClick={findContextVO}>Find this VO<ArrowRight size={14} /></Button>}{onBackToVO && <BackButton onClick={onBackToVO}>Back to VO review</BackButton>}</div>
    </section>}
    {mode === 'history' && <>
      {feedback && <Feedback feedback={feedback} />}
      {Object.keys(dirtyPeriods).some((month) => dirtyPeriods[month] && !latestFor(project, month)) && <div className="claim-resume"><div><strong>You have an unfinished claim</strong><span>{periodLabel(Object.keys(dirtyPeriods).find((month) => dirtyPeriods[month] && !latestFor(project, month)))}</span></div><Button onClick={() => { const month = Object.keys(dirtyPeriods).find((entry) => dirtyPeriods[entry] && !latestFor(project, entry)); setPeriod(month); setMode('edit'); setStep(1); }}>Continue</Button></div>}
      {groups.length > 0 && <div className="claim-home-heading"><h2>Saved claims</h2><p>Latest version for each month. Earlier versions stay in history.</p></div>}
      {groups.length ? <SavedClaimsList project={project} groups={groups} currency={currency} dirtyPeriods={historyDirtyPeriods} onContinue={start} onPrepare={prepare} onPreview={onPreview} onTrack={onTrack} onRevise={resumeRevision} /> : <section className="claim-empty-home"><div className="claim-empty-icon"><FileCheck2 size={26} /></div><h2>No claims saved yet</h2><p>A claim brings together verified work and approved extra work for one month.</p>{!project.items.length ? <Button icon={FileText} onClick={onOpenContract}>Add a contract first</Button> : <Button className="primary" icon={Plus} onClick={() => start()}>Start your first claim</Button>}</section>}
      <p className="claim-local-note">Demo · Saved in this browser. No real submission or payment.</p>
    </>}

    {mode === 'edit' && <>
      <ol className="claim-stepper" aria-label="Claim preparation steps">{['Choose work', 'Enter totals', 'Review'].map((label, index) => <li className={step === index + 1 ? 'current' : step > index + 1 ? 'done' : ''} key={label}><button type="button" aria-current={step === index + 1 ? 'step' : undefined} disabled={index + 1 > step && review.selectedCount === 0} onClick={() => goStep(index + 1)}><i>{step > index + 1 ? <Check size={13} /> : index + 1}</i><span>{label}</span></button>{index < 2 && <ChevronRight size={15} />}</li>)}</ol>
      {feedback && <Feedback feedback={feedback} />}
      {step === 1 && <div className="claim-editor-content"><section className="claim-step-panel"><header className="claim-step-heading"><div><h2>Choose work for this claim</h2><p>Select verified work and extra work cleared for claiming.</p></div><FormField className="claim-month-field" label="Claim month" hint={`Cutoff: ${dayLabel(review.cutoff)}`}><Input className="form-input" type="month" aria-label="Claim period" disabled={revisionMode} value={period} onChange={(event) => { setPeriod(event.target.value); setFeedback(null); }} /></FormField></header>{contractNeedsReview && <div className="claim-next-action"><CircleAlert size={17} /><div><strong>Confirm the contract before preparing</strong><p>You can save a draft while the contract is being checked.</p></div><Button onClick={onOpenContract}>Review contract<ArrowRight size={14} /></Button></div>}<div className="claim-group-heading"><h3><ListChecks size={16} />Verified work</h3><button type="button" onClick={onOpenCompletion}>Completion list<ArrowRight size={13} /></button></div>{workRows.length ? <div className="claim-choice-list">{workRows.map((row) => renderChoice(row, 'work'))}</div> : <div className="claim-step-empty"><p>No verified work is available for this month.</p><Button onClick={onOpenCompletion}>Review completion</Button></div>}<div className="claim-group-heading"><h3><Flag size={16} />Eligible extra work <span>(VO)</span></h3><button type="button" onClick={onOpenVO}>VO review<ArrowRight size={13} /></button></div>{voRows.length ? <div className="claim-choice-list">{voRows.map((row) => renderChoice(row, 'vos'))}</div> : <p className="claim-section-empty">No eligible extra work for this month.</p>}{pendingVOCount > 0 && <button type="button" className="claim-pending-link" onClick={onOpenVO}>{pendingVOCount} extra-work {pendingVOCount === 1 ? 'record needs' : 'records need'} approval or review<ArrowRight size={13} /></button>}{(otherWorkRows.length > 0 || otherVORows.length > 0) && <details className="claim-prior-work"><summary><span>Other work claimed before?</span>{priorReviewCount > 0 && <Badge tone="amber">{priorReviewCount} to review</Badge>}</summary><div><p>Enter earlier claimed amounts for work that is not ready to claim this month. Any amount entered stays included for review.</p>{otherWorkRows.length > 0 && <><h3>Contract work</h3>{otherWorkRows.map((row) => renderPriorRow(row, 'work'))}</>}{otherVORows.length > 0 && <><h3>Extra work (VO)</h3>{otherVORows.map((row) => renderPriorRow(row, 'vos'))}</>}</div></details>}</section><FormActions className="claim-step-footer" secondary={<span>{review.selectedCount} selected</span>}><Button icon={Save} onClick={() => save(true)}>Save &amp; finish later</Button><Button className="primary" disabled={!review.selectedCount} onClick={() => goStep(2)}>Enter totals<ArrowRight size={14} /></Button></FormActions></div>}
      {step === 2 && <div className="claim-editor-content"><div className="claim-editor-intro"><h2>Enter the totals for {periodLabel(period)}</h2><p>Enter totals across all months, then deduct amounts claimed before. Verified progress supports your QS assessment.</p></div>{!review.selectedCount ? <div className="claim-step-empty"><p>Choose work before entering totals.</p><Button onClick={() => goStep(1)}>Choose work</Button></div> : <><div className="claim-values-list">{selectedWork.length > 0 && <section className="claim-value-section" aria-label="Contract work values"><h3 className="claim-value-section-heading"><ListChecks size={16} />Contract work <span>{selectedWork.length}</span></h3>{selectedWork.map((row) => renderValueCard(row, 'work'))}</section>}{selectedVOs.length > 0 && <section className="claim-value-section" aria-label="Extra-work values"><h3 className="claim-value-section-heading"><Flag size={16} />Extra work (VO) <span>{selectedVOs.length}</span></h3>{selectedVOs.map((row) => renderValueCard(row, 'vos'))}</section>}</div><section className="claim-confirm-panel"><label className="claim-check-label"><Checkbox checked={assessment.priorConfirmed} onChange={(event) => update('priorConfirmed', event.target.checked)} /><span><strong>Confirm previous claims</strong>I checked previous claim records. Blank “Claimed before” amounts mean zero.</span></label>{negativeAdjustment && <FormField className="claim-note-field" label="Reason for the reduction"><Textarea className="form-textarea" rows={2} value={assessment.adjustmentReason || ''} onChange={(event) => update('adjustmentReason', event.target.value)} placeholder="Explain why the total is less than the amount claimed before…" /></FormField>}<details className="claim-optional-note" open={assessment.note ? true : undefined}><summary>Add a QS note <span>Optional</span></summary><FormField label="QS note" optional><Textarea aria-label="QS note" className="form-textarea" rows={2} value={assessment.note || ''} onChange={(event) => update('note', event.target.value)} placeholder="Measurement details or follow-up…" /></FormField></details></section></>}<FormActions className="claim-step-footer" secondary={<BackButton onClick={() => goStep(1)}>Back to choose work</BackButton>}><Button icon={Save} onClick={() => save(true)}>Save &amp; finish later</Button><Button className="primary" disabled={!review.selectedCount} onClick={() => goStep(3)}>Review claim<ArrowRight size={14} /></Button></FormActions></div>}
      {step === 3 && <div className="claim-editor-content"><section className="claim-review-panel"><header className="claim-step-heading"><div><h2>Review your claim</h2><p>{review.selectedCount} selected {review.selectedCount === 1 ? 'item' : 'items'} · Through {dayLabel(review.cutoff)}</p></div><button type="button" className="claim-text-button" onClick={() => goStep(2)}>Edit values</button></header><div className="claim-review-math"><div><span>Assessed value to date</span><strong>{currency} {amount(review.totals.cumulativeValue)}</strong></div><div><span>Less claimed before</span><strong>{currency} {amount(review.totals.previousValue)}</strong></div><div className="claim-review-total"><span>This month</span><strong>{currency} {amount(review.totals.currentValue)}</strong></div></div><details className="claim-review-items"><summary>View {review.selectedCount} selected {review.selectedCount === 1 ? 'item' : 'items'}</summary>{[...selectedWork, ...selectedVOs].map((row) => <div key={row.id}><span><strong>{row.description || row.title}</strong><small>{row.ref || row.reference} · {row.assessedQuantity != null ? `${formatNumber(row.assessedQuantity)} ${row.unit} total quantity` : `${currency} ${amount(row.assessedValue)} total value`}</small></span><strong>{currency} {amount(row.currentValue)}<small>This month</small></strong></div>)}</details><p className="claim-review-note">Before tax, retention and other deductions.</p></section>{review.canPrepare ? <div className="claim-ready-message"><Check size={17} /><span>Ready to save. You can preview the saved draft, then mark it prepared.</span></div> : <section className="claim-review-checks"><header><CircleAlert size={17} /><div><h3>{review.issues.length} {review.issues.length === 1 ? 'check' : 'checks'} before preparation</h3><p>You can still save and finish later.</p></div></header><ul>{review.issues.map((issue, index) => <li key={`${index}-${issue}`}>{friendlyIssue(issue)}</li>)}</ul><div>{contractNeedsReview && <Button onClick={onOpenContract}>Review contract</Button>}<Button onClick={() => goStep(2)}>Check entered values</Button></div></section>}<FormActions className="claim-step-footer" secondary={<BackButton onClick={() => goStep(2)}>Back to enter totals</BackButton>}><Button className="primary" icon={Save} onClick={() => save()}>{revisionMode ? 'Save revised claim' : 'Save claim draft'}</Button></FormActions></div>}
      <p className="claim-local-note">Your unfinished edits stay while you browse. Save before refreshing.</p>
    </>}

    {mode === 'saved' && saved && <section className="claim-saved-result" aria-label="Saved claim next steps">
      <header className="claim-saved-heading"><div className={`claim-saved-icon${saved.status === 'prepared' ? ' prepared' : ''}`}>{saved.status === 'prepared' ? <CheckCheck size={23} /> : <Check size={23} />}</div><div><h2>{saved.status === 'prepared' ? 'Ready to track' : saved.snapshot.canPrepare ? 'Ready for your review' : 'Finish the remaining checks'}</h2><p>{periodLabel(saved.period)} · Version {saved.revision} · {selectedRows(saved.snapshot).length} selected {selectedRows(saved.snapshot).length === 1 ? 'item' : 'items'}</p></div><Badge tone={saved.status === 'prepared' ? 'green' : 'slate'}>{saved.status === 'prepared' ? 'Prepared' : 'Draft'}</Badge></header>
      <div className="claim-saved-amount"><span>Claim amount this month</span><strong>{saved.snapshot.currency} {amount(saved.snapshot.totals.currentValue)}</strong></div>
      <p className="claim-saved-help">{saved.status === 'prepared' ? 'Open status tracking to record submission, certification and payment for this version.' : saved.snapshot.canPrepare ? 'Preview this saved version, then mark it prepared. Its version and amount stay the same.' : 'Continue editing to finish the checks. Your draft is saved and can be previewed.'}</p>
      {feedback && <Feedback feedback={feedback} />}
      <div className="claim-saved-actions">
        <Button className={saved.status === 'prepared' && !onTrack ? 'primary' : ''} icon={FileText} onClick={() => onPreview?.(saved.id)}>Preview &amp; export</Button>
        {saved.status === 'prepared' && onTrack && <Button className="primary" icon={ArrowRight} onClick={() => onTrack(saved.id)}>Track claim status</Button>}
        {saved.status !== 'prepared' && <Button className={saved.snapshot.canPrepare ? 'primary' : ''} icon={CheckCheck} disabled={!saved.snapshot.canPrepare} onClick={() => prepare(saved.id)}>Mark prepared</Button>}
        {saved.status !== 'prepared' && !saved.snapshot.canPrepare && <Button className="primary" onClick={() => start(saved)}>Continue editing</Button>}
      </div>
      {!(revisionMode && saved.status === 'prepared') && (saved.status === 'prepared' || saved.snapshot.canPrepare) && <details className="claim-saved-options"><summary>More options</summary><Button icon={saved.status === 'prepared' ? Plus : ArrowRight} onClick={() => start(saved)}>{saved.status === 'prepared' ? 'Start new version' : 'Continue editing'}</Button></details>}
      <p className="claim-local-note">Saved in this browser. No real submission or payment.</p>
    </section>}

  </div>;
}

function Feedback({ feedback }) {
  const node = useRef(null);
  useEffect(() => { if (feedback.error) node.current?.focus(); }, [feedback]);
  return <div ref={node} tabIndex={feedback.error ? -1 : undefined} className={`claim-feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.error ? <CircleAlert size={16} /> : <Check size={16} />}<span>{feedback.message}</span></div>;
}

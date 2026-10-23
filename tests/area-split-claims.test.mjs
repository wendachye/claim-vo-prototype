import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace, loadWorkspace, resetProject, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createAreaSplitDemo } from '../src/data/area-split-demo.ts';
import { getAreaProgress } from '../src/data/drawing-progress.ts';
import { getItemAreaRollup } from '../src/data/area-allocations.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport, addProgressReport } from '../src/data/progress-review.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { getProjectWorkflow } from '../src/data/workflow.ts';
import { saveClaimDraft, buildClaimReview } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { createClaimExamplesDemo } from '../src/data/claim-examples-demo.ts';
import { installDrawing, saveAreaMapping } from '../src/data/drawing-mapping.ts';

const now=new Date('2026-10-10T10:00:00+08:00');
const updated=result=>{assert.ok(['updated','applied'].includes(result.outcome),result.error);return result.project;};
const demo=()=>{const result=createAreaSplitDemo(seedWorkspace(),now);assert.equal(result.outcome,'updated',result.error);return result;};
const assessment={priorConfirmed:true,work:{'WI-001':{include:true,assessedQuantity:480,previousValue:0}}};
function processed(project){for(const message of [...project.whatsappMessages].reverse()){const result=processWhatsAppMessage(project,message.id);assert.equal(result.outcome,'processed');project=result.project;}return project;}
function verified(project,dates=['2026-10-11T10:00:00+08:00','2026-10-11T11:00:00+08:00']) {
  for(const [index,message] of project.whatsappMessages.entries()) {
    const report=project.reports.find(report=>report.sourceMessageId===message.id);
    project=updated(verifyProgressReport(project,report.id,String(message.completion),'',dates[index]));
  }return project;
}

test('separate split demo preserves existing projects, reuses real bundled photo paths and resets to its own starting split',()=>{
  const workspace=seedWorkspace(),before=structuredClone(workspace);
  const result=createAreaSplitDemo(workspace,now);
  assert.equal(result.outcome,'updated',result.error);
  assert.deepEqual(workspace,before);
  assert.deepEqual(result.workspace.projects.slice(0,-1),before.projects);
  assert.equal(result.project.items.find(item=>item.id==='WI-001').quantity,1200);
  assert.deepEqual(result.project.drawingMapping.areas.map(area=>area.workItemQuantities['WI-001']),[720,480]);
  assert.notEqual(result.project.whatsappMessages[0].photo,result.project.whatsappMessages[1].photo);
  const second=createAreaSplitDemo(result.workspace,now);assert.equal(second.outcome,'updated');assert.notEqual(second.project.id,result.project.id);
  const reset=resetProject(verified(processed(result.project)));
  assert.deepEqual(reset.drawingMapping,result.project.drawingMapping);assert.deepEqual(reset.reports,[]);assert.equal(reset.locked,true);
  assert.equal(reset.lockedAt,result.project.lockedAt);
  const storage=new Map([[WORKSPACE_STORE,JSON.stringify({...result.workspace,projects:[...before.projects,verified(processed(result.project))]})]]);
  const loaded=loadWorkspace({getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)});
  assert.equal(getItemAreaRollup(loaded.projects.at(-1),'WI-001','verified').completion,40);
});

test('both area tasks stay actionable; verifying one removes only its own task',()=>{
  let project=processed(demo().project);
  const tasks=getProjectAttention(project).filter(task=>task.kind==='progress');
  assert.equal(tasks.length,2);assert.equal(getProjectWorkflow(project).counts.pendingReports,2);
  assert.deepEqual(new Set(tasks.map(task=>task.target.reportId)),new Set(project.reports.map(report=>report.id)));
  const first=project.reports[0];project=updated(verifyProgressReport(project,first.id,String(first.completion),'','2026-10-11T10:00:00+08:00'));
  const remaining=getProjectAttention(project).filter(task=>task.kind==='progress');
  assert.equal(remaining.length,1);assert.notEqual(remaining[0].target.reportId,first.id);
  assert.equal(getProjectWorkflow(project).counts.pendingReports,1);
});

test('one contract claim row uses the weighted total and freezes both area sources without duplicating money',()=>{
  let project=verified(processed(demo().project));
  const review=buildClaimReview(project,'2026-10',assessment),row=review.workRows.find(row=>row.id==='WI-001');
  assert.equal(row.verified,40);assert.equal(row.areaEvidence.length,2);assert.equal(row.currentValue,13440);
  assert.equal(review.selectedCount,1);assert.equal(review.canPrepare,true,review.issues.join('\n'));
  project=updated(saveClaimDraft(project,'2026-10',assessment));
  const draft=project.claimDrafts.at(-1),before=structuredClone(draft);
  const pack=buildClaimPack(project,draft.id).pack,beforeCSV=toClaimCSV(pack);
  assert.equal(pack.workRows.length,1);assert.equal(pack.totals.currentValue,13440);assert.equal(pack.evidenceRefs.length,2);
  assert.deepEqual(new Set(pack.evidenceRefs.map(ref=>ref.areaProgress.allocatedQuantity)),new Set([720,480]));
  assert.equal(new Set(pack.evidenceRefs.map(ref=>ref.id)).size,2);
  const next=addProgressReport(project,{itemId:'WI-001',area:'WEST',completion:'100',message:'WEST is now 100% cumulative.'},new Date('2026-10-12T09:00:00+08:00'));
  assert.equal(next.outcome,'updated',next.error);project=updated(verifyProgressReport(next.project,next.reportId,'100','','2026-10-12T10:00:00+08:00'));
  assert.equal(getItemAreaRollup(project,'WI-001').completion,70);
  assert.deepEqual(project.claimDrafts.at(-1),before);assert.equal(toClaimCSV(buildClaimPack(project,draft.id).pack),beforeCSV);
});

test('claim cutoff sums only independently verified area evidence by that month end',()=>{
  const project=verified(processed(demo().project),['2026-10-11T10:00:00+08:00','2026-11-02T10:00:00+08:00']);
  const october=buildClaimReview(project,'2026-10',assessment).workRows.find(row=>row.id==='WI-001');
  assert.equal(october.verified,30);assert.equal(october.areaEvidence.length,1);assert.equal(october.areaEvidence[0].area,'WEST');
  const november=buildClaimReview(project,'2026-11',assessment).workRows.find(row=>row.id==='WI-001');
  assert.equal(november.verified,40);assert.equal(november.areaEvidence.length,2);
  const past=buildClaimReview(project,'2026-09',assessment).workRows.find(row=>row.id==='WI-001');
  assert.equal(past.verified,0,'later aggregate item fields never become earlier unrecorded progress');
});

test('existing paid, ready and incomplete saved claims retain exact evidence and exports after allocation and new progress',()=>{
  let project=createClaimExamplesDemo({code:'OLD-SAVED'},now);
  const originals=structuredClone(project.claimDrafts),tracking=structuredClone(project.claimTracking);
  const csv=project.claimDrafts.map(draft=>toClaimCSV(buildClaimPack(project,draft.id).pack));
  project=installDrawing(project,{inputKind:'sample'},now).project;
  for(const [index,quantity] of [600,400].entries()) {
    const area=project.drawingMapping.areas[index];
    project=updated(saveAreaMapping(project,{...area,areaId:area.id,workItemIds:['WI-001'],workItemQuantities:{'WI-001':quantity}},now));
  }
  const report=addProgressReport(project,{itemId:'WI-001',area:'A1',completion:'50',message:'A1 50% of its assigned 600 m².'},now);
  project=updated(verifyProgressReport(report.project,report.reportId,'50','',now));
  assert.equal(getAreaProgress(project,project.drawingMapping.areas[0].id).items[0].completion,50);
  assert.equal(getItemAreaRollup(project,'WI-001').completion,30);
  assert.deepEqual(project.claimDrafts,originals);assert.deepEqual(project.claimTracking,tracking);
  assert.deepEqual(project.claimDrafts.map(draft=>toClaimCSV(buildClaimPack(project,draft.id).pack)),csv);
});


test('clearing an unused split and later reactivating it preserves intervening whole-item claim evidence',()=>{
  let project=createClaimExamplesDemo({code:'RESPLIT'},new Date('2026-10-20T10:00:00+08:00'));
  project=installDrawing(project,{inputKind:'sample'},new Date('2026-10-01T09:00:00+08:00')).project;
  const area=project.drawingMapping.areas[0];
  project=updated(saveAreaMapping(project,{...area,areaId:area.id,workItemIds:['WI-001'],workItemQuantities:{'WI-001':600}},'2026-10-01T10:00:00+08:00'));
  project=updated(saveAreaMapping(project,{...project.drawingMapping.areas[0],areaId:area.id,workItemQuantities:{}},'2026-10-02T10:00:00+08:00'));
  project.reports.push({id:'OCT-WHOLE',itemId:'WI-001',projectId:project.id,status:'verified',completion:50,approvedCompletion:50,date:'2026-10-10T10:00:00+08:00',verifiedAt:'2026-10-10T11:00:00+08:00',sender:'Original worker',message:'Whole item 50% reviewed during whole-item tracking.'});
  project=updated(saveAreaMapping(project,{...project.drawingMapping.areas[0],areaId:area.id,workItemQuantities:{'WI-001':600}},'2026-11-01T10:00:00+08:00'));
  const row=buildClaimReview(project,'2026-10',assessment).workRows.find(row=>row.id==='WI-001');
  assert.equal(row.verified,50);assert.equal(row.evidence.id,'OCT-WHOLE');assert.equal(row.areaEvidence,undefined);
});

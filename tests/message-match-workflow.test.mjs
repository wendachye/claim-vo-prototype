import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace, resetProject, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { getItemAreaRollup } from '../src/data/area-allocations.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
const now=new Date('2026-10-10T10:00:00Z');
const demo=()=>createMessageMatchDemo(seedWorkspace(),now);
const updated=r=>{assert.equal(r.outcome,'updated',r.error);return r.project;};
const original=p=>p.whatsappMessages.map(({status,processingNote,processedAt,reportId,...source})=>source);

test('correcting a mock proposal changes no progress until explicit processing and supervisor review',()=>{
  let project=demo().project;const sources=structuredClone(original(project));
  const wrong=project.whatsappMessages[1],east=project.drawingMapping.areas.find(area=>area.code==='EAST');
  const unreviewed=processWhatsAppMessage(project,wrong.id);assert.equal(unreviewed.outcome,'invalid');assert.equal(unreviewed.project,project);
  const values={itemId:'WI-001',areaId:east.id,reason:'The original names east wall cladding, not west roof sheeting.'};
  project=updated(saveMessageMatchReview(project,wrong.id,values,'2026-10-11T10:00:00Z'));
  assert.equal(project.reports.length,0);assert.equal(getItemAreaRollup(project,'WI-001','reported').completion,null);
  const sourceAfterReview=original(project);assert.deepEqual(sourceAfterReview,sources);
  const result=processWhatsAppMessage(project,wrong.id);assert.equal(result.outcome,'processed');project=result.project;
  const report=project.reports.find(report=>report.id===result.reportId);
  assert.equal(report.itemId,'WI-001');assert.equal(report.areaMapping.code,'EAST');assert.equal(report.status,'pending');
  assert.equal(report.message,wrong.text);assert.equal(report.photo,wrong.photo);assert.equal(report.area,wrong.area);
  assert.equal(report.matchReview.reason,values.reason);assert.equal(report.matchReview.suggested.itemId,'WI-002');
  assert.equal(report.matchReview.confirmed.itemId,'WI-001');assert.equal(report.areaProgress.allocatedQuantity,480);
  assert.equal(getItemAreaRollup(project,'WI-001','reported').completion,10);assert.equal(getItemAreaRollup(project,'WI-001','verified').completion,null);
  assert.ok(getProjectAttention(project).some(task=>task.target.reportId===report.id));
  project=updated(verifyProgressReport(project,report.id,25,'','2026-10-12T10:00:00Z'));
  assert.equal(getItemAreaRollup(project,'WI-001','verified').completion,10);
  assert.deepEqual(original(project),sources);
  assert.equal(processWhatsAppMessage(project,wrong.id).outcome,'duplicate');
  assert.equal(saveMessageMatchReview(project,wrong.id,values).outcome,'invalid');
  const reset=resetProject(project);assert.deepEqual(reset.messageMatchReviews ?? [],[]);assert.deepEqual(reset.reports,[]);
});

test('new claim evidence and exports freeze match correction reasons without rewriting earlier saved claims',()=>{
  const result=demo();let project=result.project;
  for(const [index,message] of project.whatsappMessages.slice(0,2).entries()){
    const area=project.drawingMapping.areas[index];
    project=updated(saveMessageMatchReview(project,message.id,{itemId:'WI-001',areaId:area.id,reason:index?'Original text refers to EAST cladding.':''},'2026-10-11T10:00:00Z'));
    const processed=processWhatsAppMessage(project,message.id);assert.equal(processed.outcome,'processed');
    project=updated(verifyProgressReport(processed.project,processed.reportId,message.completion,'','2026-10-12T10:00:00Z'));
  }
  project=updated(saveClaimDraft(project,'2026-10',{priorConfirmed:true,work:{'WI-001':{include:true,assessedQuantity:480,previousValue:0}}}));
  const claim=project.claimDrafts.at(-1),snapshot=structuredClone(claim),pack=buildClaimPack(project,claim.id).pack,csv=toClaimCSV(pack);
  assert.equal(pack.workRows.length,1);assert.equal(pack.totals.currentValue,13440);
  assert.equal(pack.evidenceRefs.length,2);assert.ok(pack.evidenceRefs.some(ref=>ref.matchReview?.reason==='Original text refers to EAST cladding.'));
  assert.match(csv,/Original text refers to EAST cladding/);
  const malformed=structuredClone(project);
  for(const row of malformed.claimDrafts.at(-1).snapshot.workRows){if(row.evidence?.matchReview)row.evidence.matchReview.reason={bad:true};for(const evidence of row.areaEvidence||[])if(evidence.matchReview)evidence.matchReview.reviewedBy={bad:true};}
  const retained=structuredClone(malformed.claimDrafts);
  const safePack=buildClaimPack(malformed,claim.id).pack;assert.ok(safePack);assert.ok(safePack.evidenceRefs.every(ref=>!ref.matchReview));
  assert.doesNotThrow(()=>toClaimCSV(safePack));assert.deepEqual(malformed.claimDrafts,retained);
  const east=project.drawingMapping.areas[1];project=updated(saveAreaMapping(project,{...east,areaId:east.id,name:'Renamed east area',aliases:['Changed name']},'2026-10-13T10:00:00Z'));
  project={...project,messageMatchReviews:[]};
  assert.deepEqual(project.claimDrafts.at(-1),snapshot);assert.equal(toClaimCSV(buildClaimPack(project,claim.id).pack),csv);
  const storage=new Map([[WORKSPACE_STORE,JSON.stringify({...result.workspace,projects:result.workspace.projects.map(entry=>entry.id===project.id?project:entry)})]]);
  const loaded=loadWorkspace({getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}).projects.find(entry=>entry.id===project.id);
  assert.deepEqual(loaded.claimDrafts.at(-1),snapshot);assert.equal(toClaimCSV(buildClaimPack(loaded,claim.id).pack),csv);
});

test('malformed review history is retained instead of silently replaced when saving',()=>{
 const project={...demo().project,messageMatchReviews:{unavailable:'Retain this original value'}};
 const before=structuredClone(project),message=project.whatsappMessages[0],area=project.drawingMapping.areas[0];
 const result=saveMessageMatchReview(project,message.id,{itemId:'WI-001',areaId:area.id,reason:''},'2026-10-11T10:00:00Z');
 assert.equal(result.outcome,'invalid');assert.match(result.error,/review history is unavailable/);assert.equal(result.project,project);assert.deepEqual(project,before);
});

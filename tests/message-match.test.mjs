import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getDrawingMapping, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getItemAreaRollup } from '../src/data/area-allocations.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
import { saveMessageClarificationRequest, saveMockClarificationReply } from '../src/data/whatsapp-clarification.ts';
const now = new Date('2026-10-12T10:00:00Z');
const fixture = () => createMessageMatchDemo(seedWorkspace(),now).project;
const financial = project => structuredClone({contract:project.contract,sourceItems:project.sourceItems,baselines:project.baselines,claimDrafts:project.claimDrafts,claimTracking:project.claimTracking});
const selected = (project,code,itemId='WI-001',reason='') => ({itemId,areaId:getDrawingMapping(project).areas.find(area=>area.code===code).id,reason});
const save = (project,index=0,code='WEST',reason='') => saveMessageMatchReview(project,project.whatsappMessages[index].id,selected(project,code,'WI-001',reason),now);

test('a correct mock suggestion needs explicit review and processing without rewriting its original',()=>{
  const project=fixture(),before=structuredClone(project),original=project.whatsappMessages[0];
  const context=getMessageMatchContext(project,original.id);
  assert.equal(context.eligible,true);assert.equal(context.requiresReview,true);assert.equal(context.review,null);
  const blocked=processWhatsAppMessage(project,original.id);assert.equal(blocked.outcome,'invalid');assert.match(blocked.error,/Review/);assert.equal(blocked.project,project);
  const saved=save(project);assert.equal(saved.outcome,'updated',saved.error);
  assert.deepEqual(saved.project.whatsappMessages,project.whatsappMessages);assert.deepEqual(saved.project.reports,project.reports);assert.deepEqual(saved.project.items,project.items);
  assert.deepEqual(financial(saved.project),financial(project));assert.deepEqual(project,before);
  assert.equal(save(saved.project).outcome,'unchanged');assert.equal(save(saved.project).project,saved.project);
  const reviewed=getMessageMatchContext(saved.project,original.id);
  assert.equal(reviewed.requiresReview,false);assert.equal(reviewed.effectiveMessage.area,'WEST');assert.equal(reviewed.review.reason,'');
  const processed=processWhatsAppMessage(saved.project,original.id);assert.equal(processed.outcome,'processed');
  const report=processed.project.reports.at(-1);
  for(const key of ['photo','photoAlt','sender','date','area','location'])assert.deepEqual(report[key],original[key]);
  assert.equal(report.message,original.text);assert.deepEqual(report.matchReview,saved.review);
  assert.equal(report.status,'pending');assert.equal(report.areaProgress.allocatedQuantity,720);
  assert.equal(getItemAreaRollup(processed.project,'WI-001','reported').completion,30);
  assert.equal(getItemAreaRollup(processed.project,'WI-001','verified').completion,null);
  assert.equal(processWhatsAppMessage(processed.project,original.id).outcome,'duplicate');
  assert.equal(save(processed.project).outcome,'invalid');
});

test('corrected item and area require a reason and preserve the mistaken suggestion through verification',()=>{
  const project=fixture(),original=structuredClone(project.whatsappMessages[1]);
  assert.equal(original.matchSuggestion.fields.itemId,'WI-002');
  assert.equal(save(project,1,'EAST').outcome,'invalid');
  const result=save(project,1,'EAST','This is east-wall cladding, not roofing.');assert.equal(result.outcome,'updated',result.error);
  assert.equal(result.review.originalSuggestion.fields.itemId,'WI-002');assert.equal(result.review.suggested.areaCode,'WEST');
  assert.equal(result.review.confirmed.areaCode,'EAST');assert.equal(result.review.fields.itemId,'WI-001');
  assert.deepEqual(result.project.whatsappMessages[1],original);
  const processed=processWhatsAppMessage(result.project,original.id);assert.equal(processed.outcome,'processed');
  let report=processed.project.reports.at(-1);assert.equal(report.itemId,'WI-001');assert.equal(report.areaMapping.code,'EAST');assert.equal(report.completion,25);
  assert.equal(getItemAreaRollup(processed.project,'WI-001','reported').completion,10);
  const verified=verifyProgressReport(processed.project,report.id,25,'','2026-10-13T10:00:00Z');assert.equal(verified.outcome,'updated');
  report=verified.project.reports.at(-1);assert.deepEqual(report.matchReview,result.review);
  assert.equal(getItemAreaRollup(verified.project,'WI-001','verified').completion,10);assert.deepEqual(financial(verified.project),financial(project));
});

test('safe new reviews append independently, unchanged replay is a no-op, and malformed latest reviews cannot resurrect old ones',()=>{
  let project=fixture();project=save(project).project;
  const first=structuredClone(project.messageMatchReviews[0]);
  const changed=saveMessageMatchReview(project,project.whatsappMessages[0].id,selected(project,'WEST','WI-001','Checked the worker wording.'),now);
  assert.equal(changed.outcome,'updated');assert.equal(changed.project.messageMatchReviews.length,2);assert.deepEqual(changed.project.messageMatchReviews[0],first);
  changed.project.messageMatchReviews.at(-1).fields.completion=99;
  const broken=getMessageMatchContext(changed.project,project.whatsappMessages[0].id);
  assert.equal(broken.review,null);assert.equal(broken.requiresReview,true);assert.equal(processWhatsAppMessage(changed.project,project.whatsappMessages[0].id).outcome,'invalid');
});

test('source, baseline and mapping revisions invalidate a review without altering source evidence',()=>{
  const initial=save(fixture()).project,id=initial.whatsappMessages[0].id;
  const source=structuredClone(initial);source.whatsappMessages[0].photo='/assets/demo-platform.jpg';
  assert.equal(getMessageMatchContext(source,id).review,null);assert.equal(processWhatsAppMessage(source,id).outcome,'invalid');
  const baseline={...initial,version:initial.version+1};assert.equal(getMessageMatchContext(baseline,id).review,null);assert.equal(save(baseline).outcome,'invalid');
  const area=getDrawingMapping(initial).areas[0];const moved=saveAreaMapping(initial,{...area,areaId:area.id,name:'Renamed west wall'},'2026-10-13T11:00:00Z').project;
  assert.equal(getMessageMatchContext(moved,id).requiresReview,true);assert.deepEqual(moved.messageMatchReviews,initial.messageMatchReviews);
  const reviewed=save(moved);assert.equal(reviewed.outcome,'updated');assert.equal(reviewed.project.messageMatchReviews.length,2);
});

test('foreign IDs, unsupported items and bad reasons cannot be saved, while missing proposed IDs may be corrected safely',()=>{
  const project=fixture(),id=project.whatsappMessages[0].id;
  for(const values of [selected(project,'WEST','foreign','reason'),{...selected(project,'WEST'),areaId:'foreign'}, {...selected(project,'WEST'),reason:'x'.repeat(1001)}, {...selected(project,'WEST'),reason:42}]){
    const result=saveMessageMatchReview(project,id,values,now);assert.equal(result.outcome,'invalid');assert.equal(result.project,project);
  }
  const unknown=structuredClone(project);unknown.whatsappMessages[0].matchSuggestion.fields.itemId='unavailable';unknown.whatsappMessages[0].matchSuggestion.fields.areaId='unavailable';
  assert.equal(getMessageMatchContext(unknown,id).eligible,true);assert.equal(save(unknown,0,'WEST','Selected the correct current scope.').outcome,'updated');
});

test('ambiguous aliases, explicit-code conflicts, incremental percentages and malformed metadata stay in clarification',()=>{
  const initial=fixture();
  const cases=[
    project=>project.whatsappMessages[0].area='Wall frontage',
    project=>project.whatsappMessages[0].text+=' WI-002',
    project=>project.whatsappMessages[0].text+=' WI-999',
    project=>project.whatsappMessages[0].completionBasis='incremental',
    project=>project.whatsappMessages[0].text+=' Another 50% today.',
    project=>project.whatsappMessages[0].text+=' +50% today.',
    project=>project.whatsappMessages[0].text+=' -50% total.',
    project=>project.whatsappMessages[0].text+=' EAST and WEST.',
    project=>project.whatsappMessages[0].kind='vo',
    project=>project.whatsappMessages[0].completion=101,
    project=>project.whatsappMessages[0].matchSuggestion.sourceExcerpt='not in the original',
    project=>project.whatsappMessages[0].matchSuggestion.fields.completion=77,
    project=>project.whatsappMessages[0].areaId='FOREIGN',
    project=>project.whatsappMessages[0].areaProgress={areaId:project.drawingMapping.areas[0].id,itemId:'WI-001',allocatedQuantity:999,contractQuantity:1200},
    project=>project.whatsappMessages[0].replyToMessageId='not-real',
  ];
  for(const change of cases){
    const project=structuredClone(initial);change(project);const id=project.whatsappMessages[0].id,before=structuredClone(project);
    const context=getMessageMatchContext(project,id);assert.equal(context.eligible,false);assert.equal(context.clarificationRequired,true,JSON.stringify(project.whatsappMessages[0]));
    assert.equal(save(project).outcome,'invalid');const result=processWhatsAppMessage(project,id);assert.equal(result.outcome,'clarification');
    assert.deepEqual(result.project.items,before.items);assert.deepEqual(result.project.reports,before.reports);assert.deepEqual(financial(result.project),financial(before));
  }
});

test('an explicit area code cannot be overwritten by a review, but a unique wrong suggestion can be corrected to it',()=>{
  let project=fixture(),message=project.whatsappMessages[1];message.area='EAST';
  assert.equal(save(project,1,'WEST','Use west instead').outcome,'invalid');
  assert.equal(save(project,1,'EAST','Worker identified EAST cladding.').outcome,'updated');
  project=fixture();message=project.whatsappMessages[0];message.text+=' WI-001';
  assert.equal(saveMessageMatchReview(project,message.id,selected(project,'WEST','WI-002','Wrong code'),now).outcome,'invalid');
});

test('clarification still creates a separate worker reply rather than a match override',()=>{
  let project=fixture();const original=structuredClone(project.whatsappMessages[2]);
  project=processWhatsAppMessage(project,original.id).project;
  assert.equal(project.whatsappMessages[2].status,'clarification');
  project=saveMessageClarificationRequest(project,original.id,{question:'Confirm WEST or EAST and cumulative completion.'},now).project;
  const east=selected(project,'EAST');
  const reply=saveMockClarificationReply(project,original.id,{itemId:east.itemId,areaId:east.areaId,area:'',text:'EAST cladding is 75% complete in total.',completion:75},now);
  assert.equal(reply.outcome,'updated',reply.error);const source=reply.project.whatsappMessages.at(-1);
  assert.equal(source.matchSuggestion,undefined);assert.equal(processWhatsAppMessage(reply.project,source.id).outcome,'processed');
  for(const key of ['text','photo','sender','date'])assert.deepEqual(reply.project.messageClarifications[0].original[key],original[key]);
});

test('two reviewed messages roll up once and later review activity cannot change frozen saved claim evidence or CSV',()=>{
  let project=fixture();
  for(const [index,area,reason] of [[0,'WEST',''],[1,'EAST','East wall cladding, not roofing.']]){
    project=save(project,index,area,reason).project;const result=processWhatsAppMessage(project,project.whatsappMessages[index].id);
    assert.equal(result.outcome,'processed');project=verifyProgressReport(result.project,result.reportId,index?25:50,'','2026-10-13T10:00:00Z').project;
  }
  assert.equal(getItemAreaRollup(project,'WI-001','verified').completion,40);
  const saved=saveClaimDraft(project,'2026-10',{priorConfirmed:true,work:{'WI-001':{include:true,assessedQuantity:480,previousValue:0}}});
  assert.equal(saved.outcome,'updated',saved.error);project=saved.project;
  const draft=project.claimDrafts.at(-1),pack=buildClaimPack(project,draft.id).pack,csv=toClaimCSV(pack),before=structuredClone(draft);
  assert.equal(pack.workRows.length,1);assert.equal(pack.totals.currentValue,13440);
  assert.equal(pack.workRows[0].areaEvidence.length,2);assert.equal(pack.workRows[0].areaEvidence[1].matchReview.confirmed.areaCode,'EAST');
  const area=getDrawingMapping(project).areas[1];project=saveAreaMapping(project,{...area,areaId:area.id,name:'Later east label'},'2026-10-14T10:00:00Z').project;
  assert.deepEqual(project.claimDrafts.at(-1),before);assert.equal(toClaimCSV(buildClaimPack(project,draft.id).pack),csv);
  const store={getItem:key=>key===WORKSPACE_STORE?JSON.stringify({...seedWorkspace(),projects:[project],activeProjectId:project.id}):null,setItem:()=>{}};
  const loaded=loadWorkspace(store).projects.find(entry=>entry.id===project.id);assert.deepEqual(loaded.messageMatchReviews,project.messageMatchReviews);
  assert.deepEqual(loaded.claimDrafts.at(-1),before);
});


test('review dates and selected item ownership must agree with the original source and project',()=>{
  const project=fixture(),id=project.whatsappMessages[0].id;
  const backdated=saveMessageMatchReview(project,id,selected(project,'WEST'),'2026-10-01T10:00:00Z');
  assert.equal(backdated.outcome,'invalid');assert.match(backdated.error,/on or after/);assert.equal(backdated.project,project);
  const corrupted=save(project).project;corrupted.messageMatchReviews[0].reviewedAt='2026-10-01T10:00:00Z';
  assert.equal(getMessageMatchContext(corrupted,id).review,null);
  for(const field of ['projectId','projectCode']){
    const foreign=structuredClone(project);foreign.items[0][field]='FOREIGN';
    const result=save(foreign);assert.equal(result.outcome,'invalid');assert.equal(result.project,foreign);
  }
});


test('malformed stored inbox records cannot fallback to a legacy message with the reviewed source ID',()=>{
  const project=seedWorkspace().projects[0],message=project.whatsappMessages[0];
  message.demo=true;message.origin='simulated';message.matchSuggestion={version:1,origin:'mock',baselineVersion:project.version,fields:{itemId:'WI-001',areaId:'missing',completion:65},sourceExcerpt:message.text,reason:'Mock source'};
  project.whatsappMessages.push({...message,projectId:'OTHER'});
  const before=structuredClone(project),result=processWhatsAppMessage(project,message.id);
  assert.equal(result.outcome,'invalid');assert.equal(result.project,project);assert.deepEqual(project,before);
});

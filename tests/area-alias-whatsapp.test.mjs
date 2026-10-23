import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWorkspace } from '../src/data/projects.ts';
import { createAreaAliasDemo } from '../src/data/area-alias-demo.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { getDrawingMapping, saveAreaMapping } from '../src/data/drawing-mapping.ts';
import { getItemAreaRollup } from '../src/data/area-allocations.ts';
import { verifyProgressReport, addProgressReport } from '../src/data/progress-review.ts';
import { saveMessageClarificationRequest, saveMockClarificationReply, getMessageClarification } from '../src/data/whatsapp-clarification.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';
const now=new Date('2026-10-10T10:00:00Z');
const fixture=()=>createAreaAliasDemo(seedWorkspace(),now).project;
const financial=p=>structuredClone({contract:p.contract,sourceItems:p.sourceItems,baselines:p.baselines,claimDrafts:p.claimDrafts,claimTracking:p.claimTracking});

test('a unique alternate name freezes one allocated area while preserving its original source',()=>{
  const project=fixture(),message=project.whatsappMessages[0],before=structuredClone(project);
  const result=processWhatsAppMessage(project,message.id);
  assert.equal(result.outcome,'processed');
  const report=result.project.reports.at(-1);
  assert.equal(report.area,'West façade');assert.equal(report.areaMapping.code,'WEST');assert.equal(report.areaProgress.allocatedQuantity,720);
  assert.equal(report.message,message.text);assert.equal(report.photo,message.photo);
  assert.deepEqual(report.areaMapping.aliases,['West wall','West façade','Wall frontage']);
  assert.equal(getItemAreaRollup(result.project,'WI-001','reported').completion,30);
  assert.equal(getItemAreaRollup(result.project,'WI-001','verified').completion,null);
  assert.equal(processWhatsAppMessage(result.project,message.id).outcome,'duplicate');
  assert.deepEqual(financial(result.project),financial(project));assert.deepEqual(project,before);
});

test('an ambiguous name cannot create progress, a VO or a manual report, even without quantity splits',()=>{
  for(const kind of ['progress','vo'])for(const split of [true,false]){
    let project=fixture();
    const message={...project.whatsappMessages[2],kind};project={...project,whatsappMessages:[message]};
    if(!split)project={...project,drawingMapping:{...project.drawingMapping,areas:project.drawingMapping.areas.map(({workItemQuantities,...area})=>area)}};
    const before=structuredClone(project),result=processWhatsAppMessage(project,message.id);
    assert.equal(result.outcome,'clarification');
    assert.match(result.project.whatsappMessages[0].processingNote,/WEST and EAST/);
    assert.equal(result.project.whatsappMessages[0].status,'clarification');
    assert.deepEqual(result.project.items,before.items);assert.deepEqual(result.project.reports,before.reports);assert.deepEqual(result.project.voReviews,before.voReviews);
    assert.deepEqual(financial(result.project),financial(before));
    const manual=addProgressReport(project,{itemId:'WI-001',area:'Wall frontage',completion:75,message:message.text},now);
    assert.equal(manual.outcome,'invalid');assert.match(manual.error,/Confirm one area code/);
  }
});

test('a clarification reply requires a chosen area and retains the ambiguous original through verification',()=>{
  let project=fixture();const original=structuredClone(project.whatsappMessages[2]);
  project=processWhatsAppMessage(project,original.id).project;
  assert.ok(getProjectAttention(project).some(task=>task.target.messageId===original.id));
  project=saveMessageClarificationRequest(project,original.id,{question:'Confirm WEST or EAST, the work item and total.'},'2026-10-11T10:00:00Z').project;
  const values={itemId:'WI-001',area:'',text:'WEST is 75% complete in total.',completion:75};
  assert.equal(saveMockClarificationReply(project,original.id,values,'2026-10-11T10:01:00Z').outcome,'invalid');
  const west=getDrawingMapping(project).areas.find(area=>area.code==='WEST');
  project=saveMockClarificationReply(project,original.id,{...values,areaId:west.id},'2026-10-11T10:01:00Z').project;
  // A code/alias collision added afterwards must not move this explicitly chosen reply.
  const east=getDrawingMapping(project).areas.find(area=>area.code==='EAST');
  project=saveAreaMapping(project,{...east,areaId:east.id,aliases:[...east.aliases,'WEST']},'2026-10-11T10:02:00Z').project;
  const context=getMessageClarification(project,original.id),result=processWhatsAppMessage(project,context.reply.id);
  assert.equal(result.outcome,'processed');project=result.project;
  assert.equal(project.reports.at(-1).areaProgress.areaId,west.id);
  assert.equal(getMessageClarification(project,original.id).stage,'verification');
  project=verifyProgressReport(project,result.reportId,75,'','2026-10-11T10:03:00Z').project;
  assert.equal(getMessageClarification(project,original.id).stage,'verified');
  assert.equal(getItemAreaRollup(project,'WI-001','verified').completion,45);
  assert.equal(getProjectAttention(project).some(task=>task.target.messageId===original.id||task.target.reportId===result.reportId),false);
  const retained=getMessageClarification(project,original.id).original;
  for(const key of ['text','photo','photoAlt','area','sender','date'])assert.deepEqual(retained[key],original[key]);
});

test('editing aliases after saving a claim never rewrites frozen assessment, sources or CSV',()=>{
  let project=fixture();
  for(const message of project.whatsappMessages.slice(0,2)){
    const result=processWhatsAppMessage(project,message.id);assert.equal(result.outcome,'processed');
    project=verifyProgressReport(result.project,result.reportId,message.completion,'','2026-10-11T10:00:00Z').project;
  }
  const saved=saveClaimDraft(project,'2026-10',{priorConfirmed:true,work:{'WI-001':{include:true,assessedQuantity:480,previousValue:0}}});
  assert.equal(saved.outcome,'updated',saved.error);project=saved.project;
  const id=project.claimDrafts.at(-1).id,before=financial(project),reports=structuredClone(project.reports),csv=toClaimCSV(buildClaimPack(project,id).pack);
  const west=getDrawingMapping(project).areas[0];
  project=saveAreaMapping(project,{...west,areaId:west.id,aliases:['Changed name']},'2026-10-12T10:00:00Z').project;
  assert.deepEqual(financial(project),before);assert.deepEqual(project.reports,reports);
  assert.equal(toClaimCSV(buildClaimPack(project,id).pack),csv);
  assert.equal(buildClaimPack(project,id).pack.workRows.length,1);
  assert.equal(buildClaimPack(project,id).pack.totals.currentValue,13440);
});

test('malformed stored alternate names and foreign explicit areas cannot become whole-item progress',()=>{
  for(const broken of ['aliases','reference']){
    let project=fixture();
    project={...project,drawingMapping:{...project.drawingMapping,areas:project.drawingMapping.areas.map(({workItemQuantities,...area})=>area)}};
    if(broken==='aliases')project.drawingMapping.areas[1].aliases=['West façade',42];
    else project.whatsappMessages[0].areaId='OTHER-PROJECT-AREA';
    const before=structuredClone(project),message=project.whatsappMessages[0];
    const result=processWhatsAppMessage(project,message.id);
    assert.equal(result.outcome,'clarification');assert.deepEqual(result.project.items,before.items);assert.deepEqual(result.project.reports,[]);
    const manual=addProgressReport(project,{itemId:'WI-001',completion:50,area:'West façade',...(broken==='reference'?{areaId:'OTHER-PROJECT-AREA'}:{}),message:message.text},now);
    assert.equal(manual.outcome,'invalid');assert.equal(manual.project,project);
  }
});

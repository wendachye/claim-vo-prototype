import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_STORE, loadWorkspace, resetProject, updateProjectState } from '../src/data/projects.ts';
import { createSITContractDemo } from '../src/data/provided-contract-demo.ts';
import { getVOCases, updateVOReview } from '../src/data/vo.ts';
import { createVOConfirmationRequest, getVOConfirmationContext, recordVOConfirmationReply } from '../src/data/vo-confirmation.ts';
import { getProjectAttention } from '../src/data/project-attention.ts';

const now=new Date('2026-10-24T11:00:00Z');
function storage(workspace){const values=new Map([[WORKSPACE_STORE,JSON.stringify(workspace)]]);return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
function fixture(){
  let project=createSITContractDemo({name:'Confirmation storage (Demo)',code:'CONF-STORE'},now);
  const other=createSITContractDemo({name:'Other confirmation project',code:'CONF-OTHER'},now);
  const caseId=getVOCases(project).find(entry=>entry.status==='flagged').id;
  project=updateVOReview(project,caseId,'submit',{title:'Additional access bay',scopeDisposition:'variation',scopeAssessment:'Extra access bay outside the listed work.',instructionStatus:'documented',instructionReference:'DEMO-SI-24',proposedValue:650}).project;
  const workspace=loadWorkspace(storage({schemaVersion:2,activeProjectId:project.id,projects:[project,other]}));
  return {workspace,project:workspace.projects[0],other:workspace.projects[1],caseId};
}
function request(project,caseId){const result=createVOConfirmationRequest(project,caseId,{recipient:'Jordan · Fictional customer',authority:'Demo customer QS',sourceKey:getVOConfirmationContext(project,caseId).key},now);assert.equal(result.outcome,'updated',result.error);return result;}

test('confirmation snapshots and replies survive workspace reload without altering saved claims or another project',()=>{
  const {workspace,project,other,caseId}=fixture();
  const original=structuredClone(project);
  const created=request(project,caseId);
  const replied=recordVOConfirmationReply(created.project,caseId,created.requestId,{kind:'priceApproved',message:'Demo reply: quoted price of SGD650 is approved.'},new Date(now.getTime()+1000));
  assert.equal(replied.outcome,'updated',replied.error);
  const next=updateProjectState(workspace,project.id,()=>replied.project);
  const loaded=loadWorkspace(storage(next));
  assert.deepEqual(loaded.projects[0].voConfirmationRequests,replied.project.voConfirmationRequests);
  for(const key of ['claimDrafts','claimTracking','reports','items','voReviews','baselines'])assert.deepEqual(loaded.projects[0][key],original[key],key);
  assert.deepEqual(loaded.projects[1],other);
  assert.equal(getVOCases(loaded.projects[0]).find(entry=>entry.id===caseId).status,'pendingApproval');
});

test('reset clears only the selected project confirmation records and legacy projects need no added collection',()=>{
  const {workspace,project,other,caseId}=fixture();
  assert.equal(project.voConfirmationRequests,undefined);
  const created=request(project,caseId);
  const otherCase=getVOCases(other).find(entry=>entry.status==='flagged').id;
  const readyOther=updateVOReview(other,otherCase,'submit',{title:'Other access bay',scopeDisposition:'variation',scopeAssessment:'Extra work in the other project.',instructionStatus:'documented',instructionReference:'OTHER-DEMO',proposedValue:0}).project;
  const otherRequested=request(readyOther,otherCase).project;
  const active={...workspace,projects:[created.project,otherRequested]};
  const reset=updateProjectState(active,project.id,resetProject);
  assert.deepEqual(reset.projects[0].voConfirmationRequests,[]);
  assert.deepEqual(reset.projects[1],otherRequested);
  assert.deepEqual(created.project.claimDrafts,project.claimDrafts);
});

test('customer request and replies update the single existing VO attention task without approving or verifying the work',()=>{
  for(const [kind,label] of [['scopeAcknowledged','Price still unconfirmed'],['priceApproved','Reply needs QS review'],['changesRequested','Customer requested changes']]){
    const {project,caseId}=fixture();
    const originalTasks=getProjectAttention(project).filter(task=>task.target.caseId===caseId);
    assert.equal(originalTasks.length,1);
    const created=request(project,caseId);
    const task=getProjectAttention(created.project).filter(task=>task.target.caseId===caseId);
    assert.equal(task.length,1);assert.equal(task[0].id,originalTasks[0].id);assert.equal(task[0].statusLabel,'Awaiting customer reply');
    const replied=recordVOConfirmationReply(created.project,caseId,created.requestId,{kind,message:`Simulated ${kind} response.`},new Date(now.getTime()+1000));
    assert.equal(replied.outcome,'updated',replied.error);
    const after=getProjectAttention(replied.project).filter(task=>task.target.caseId===caseId);
    assert.equal(after.length,1);assert.equal(after[0].id,originalTasks[0].id);assert.equal(after[0].statusLabel,label);
    assert.deepEqual(replied.project.voReviews,project.voReviews);assert.deepEqual(replied.project.reports,project.reports);assert.deepEqual(replied.project.claimDrafts,project.claimDrafts);
  }
});

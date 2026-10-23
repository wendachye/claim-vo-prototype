import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVoiceNoteDemo } from '../src/data/voice-note-demo.ts';
import { seedWorkspace, loadWorkspace, WORKSPACE_STORE } from '../src/data/projects.ts';
import { getVoiceNoteContext, saveVoiceTranscriptReview } from '../src/data/voice-notes.ts';
import { getMessageMatchContext, saveMessageMatchReview } from '../src/data/message-match.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { verifyProgressReport } from '../src/data/progress-review.ts';
import { saveClaimDraft } from '../src/data/claims.ts';
import { buildClaimPack, toClaimCSV } from '../src/data/claim-pack.ts';

const updated=result=>{assert.equal(result.outcome,'updated',result.error);return result.project;};
test('bundled synthetic recordings are real PCM WAV files with the declared demo durations',()=>{
 const project=createVoiceNoteDemo(seedWorkspace(),new Date('2026-10-10T10:00:00Z')).project;
 for(const message of project.whatsappMessages){
  const file=readFileSync(new URL(`../public${message.audio.asset}`,import.meta.url));
  assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WAVE');
  let offset=12,rate=0,data=0;
  while(offset+8<=file.length){const kind=file.toString('ascii',offset,offset+4),length=file.readUInt32LE(offset+4);if(kind==='fmt ')rate=file.readUInt32LE(offset+16);if(kind==='data')data=length;offset+=8+length+(length%2);}
  assert.ok(rate>0&&data>1000);assert.ok(Math.abs(data/rate-message.audio.durationSeconds)<0.02);
 }
});
test('a saved claim retains its original voice recording and corrected transcript after live source changes and reload',()=>{
 const created=createVoiceNoteDemo(seedWorkspace(),new Date('2026-10-10T10:00:00Z'));let project=created.project;
 const message=project.whatsappMessages.find(source=>source.audio.clarity==='clear'),original=structuredClone(message);
 const reason='Listened to the demo recording: wall was transcribed as wail.';
 project=updated(saveVoiceTranscriptReview(project,message.id,{transcript:message.text.replace('wail','wall'),reason,sourceKey:getVoiceNoteContext(project,message.id).sourceKey},'2026-10-11T10:00:00Z'));
 const context=getMessageMatchContext(project,message.id);assert.ok(context.eligible,context.issue);
 project=updated(saveMessageMatchReview(project,message.id,{itemId:context.fields.itemId,areaId:context.fields.areaId,reason:''},'2026-10-11T11:00:00Z'));
 const processed=processWhatsAppMessage(project,message.id);assert.equal(processed.outcome,'processed',processed.error);
 project=updated(verifyProgressReport(processed.project,processed.reportId,50,'','2026-10-12T10:00:00Z'));
 project=updated(saveClaimDraft(project,'2026-10',{priorConfirmed:true,work:{'WI-001':{include:true,assessedQuantity:360,previousValue:0}}}));
 const draft=structuredClone(project.claimDrafts.at(-1));const pack=buildClaimPack(project,draft.id).pack,csv=toClaimCSV(pack);
 assert.equal(pack.evidenceRefs[0].voiceNote.originalTranscript,original.text);
 assert.equal(pack.evidenceRefs[0].voiceNote.reviewedTranscript,original.text.replace('wail','wall'));
 assert.equal(pack.evidenceRefs[0].voiceNote.reason,reason);assert.match(csv,/demo-voice-clear\.wav/);assert.match(csv,/wail/);assert.match(csv,/Listened to the demo recording/);
 const unreviewed=structuredClone(pack);Object.assign(unreviewed.evidenceRefs[0].voiceNote,{reviewedTranscript:null,reason:'',reviewedBy:null,reviewedAt:null,reviewId:null});
 assert.match(toClaimCSV(unreviewed),/correction reason: Not reviewed/);assert.doesNotMatch(toClaimCSV(unreviewed),/Original transcript confirmed/);
 const changed={...project,voiceTranscriptReviews:[],reports:[],whatsappMessages:[]};
 assert.deepEqual(changed.claimDrafts.at(-1),draft);assert.equal(toClaimCSV(buildClaimPack(changed,draft.id).pack),csv);
 const values=new Map([[WORKSPACE_STORE,JSON.stringify({...created.workspace,projects:created.workspace.projects.map(entry=>entry.id===project.id?changed:entry)})]]);
 const loaded=loadWorkspace({getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}).projects.find(entry=>entry.id===project.id);
 assert.deepEqual(loaded.claimDrafts.at(-1),JSON.parse(JSON.stringify(draft)));assert.equal(toClaimCSV(buildClaimPack(loaded,draft.id).pack),csv);
 const malformed=structuredClone(loaded);for(const row of malformed.claimDrafts.at(-1).snapshot.workRows){if(row.evidence?.voiceNote)row.evidence.voiceNote.audio.asset='https://untrusted.invalid/audio';for(const evidence of row.areaEvidence||[])if(evidence.voiceNote)evidence.voiceNote.audio.asset='https://untrusted.invalid/audio';}
 const before=structuredClone(malformed.claimDrafts);assert.ok(buildClaimPack(malformed,draft.id).pack.evidenceRefs.every(ref=>!ref.voiceNote));assert.deepEqual(malformed.claimDrafts,before);
});

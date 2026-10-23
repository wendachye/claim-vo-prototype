import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WhatsAppView } from '../src/components/WhatsAppView';
import { ClaimEvidencePanel } from '../src/components/ClaimEvidencePanel';
import { createMessageMatchDemo } from '../src/data/message-match-demo.ts';
import { seedWorkspace } from '../src/data/projects.ts';
import { processWhatsAppMessage } from '../src/data/whatsapp.ts';
import { saveMessageMatchReview } from '../src/data/message-match.ts';
import { clearProjectFormBuffers } from '../src/data/form-buffer.ts';
import { chooseSelect } from './select-helpers.mjs';
const fixture=()=>createMessageMatchDemo(seedWorkspace(),new Date('2026-10-10T10:00:00Z')).project;
beforeEach(()=>{clearProjectFormBuffers('AREA-SPLIT01');vi.stubGlobal('matchMedia',vi.fn(query=>({matches:false,media:query,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function Flow({initial,index=1,observe=()=>{}}){const[project,setProject]=useState(initial);return <WhatsAppView project={project} messages={project.whatsappMessages} initialMessageId={initial.whatsappMessages[index].id} onSaveMatch={(id,values)=>{const result=saveMessageMatchReview(project,id,values,'2026-10-11T10:00:00Z');if(result.outcome==='updated')setProject(result.project);observe(result);return result;}} onProcess={message=>{const result=processWhatsAppMessage(project,message.id);if(result.outcome!=='invalid')setProject(result.project);observe(result);}}/>;}
it('requires a reviewed correction before processing and blocks pending edits after confirmation',async()=>{
 const user=userEvent.setup(),project=fixture(),before=structuredClone(project),observe=vi.fn();render(<Flow initial={project} observe={observe}/>);
 expect(screen.getByRole('heading',{name:'Review match'})).toBeTruthy();expect(screen.getByRole('button',{name:'Add progress update',exact:true}).disabled).toBe(true);
 await user.click(screen.getByRole('button',{name:'Edit match',exact:true}));
 await chooseSelect(user,screen.getByRole('combobox',{name:'Contract work item'}),'WI-001');
 const east=project.drawingMapping.areas.find(area=>area.code==='EAST');await chooseSelect(user,screen.getByRole('combobox',{name:'Site area'}),east.id);
 await user.click(screen.getByRole('button',{name:'Confirm match',exact:true}));expect(screen.getByText('Enter a short reason for the correction.')).toBeTruthy();expect(observe).not.toHaveBeenCalled();
 const reason='Worker describes EAST wall cladding; the roofing suggestion is incorrect.';await user.type(screen.getByRole('textbox',{name:'Correction reason'}),reason);
 await user.click(screen.getByRole('button',{name:'Confirm match',exact:true}));
 let state=observe.mock.lastCall[0].project;expect(state.reports.length).toBe(0);expect(state.messageMatchReviews.at(-1).reason).toBe(reason);
 expect(screen.getByRole('button',{name:'Add progress update',exact:true}).disabled).toBe(false);
 await user.click(screen.getByRole('button',{name:'Edit match',exact:true}));expect(screen.getByRole('button',{name:'Add progress update',exact:true}).disabled).toBe(true);
 await user.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(screen.getByRole('button',{name:'Add progress update',exact:true}).disabled).toBe(false);
 await user.click(screen.getByRole('button',{name:'Add progress update',exact:true}));state=observe.mock.lastCall[0].project;
 expect(state.reports.at(-1).status).toBe('pending');expect(state.reports.at(-1).areaMapping.code).toBe('EAST');expect(state.reports.at(-1).matchReview.reason).toBe(reason);
 expect(state.reports.at(-1).message).toBe(before.whatsappMessages[1].text);expect(screen.getByRole('button',{name:'Review progress',exact:true})).toBeTruthy();expect(project).toEqual(before);
});
it('keeps ambiguous originals in clarification instead of showing an editable match',async()=>{
 const user=userEvent.setup(),project=fixture(),observe=vi.fn();render(<Flow initial={project} index={2} observe={observe}/>);
 expect(screen.queryByRole('heading',{name:'Review match'})).toBeNull();expect(screen.queryByRole('button',{name:'Confirm match',exact:true})).toBeNull();
 expect(screen.getByText(/matches WEST and EAST/)).toBeTruthy();await user.click(screen.getByRole('button',{name:'Needs clarification',exact:true}));
 const result=observe.mock.lastCall[0];expect(result.outcome).toBe('clarification');expect(result.project.reports.length).toBe(0);expect(result.project.messageMatchReviews ?? []).toEqual([]);
 expect(screen.getByRole('button',{name:'Save clarification request',exact:true})).toBeTruthy();
});
it('saved claim evidence displays its frozen correction labels and reason without live records',async()=>{
 const user=userEvent.setup();let project=fixture();const message=project.whatsappMessages[1],area=project.drawingMapping.areas[1];
 project=saveMessageMatchReview(project,message.id,{itemId:'WI-001',areaId:area.id,reason:'Saved EAST wall correction.'},'2026-10-11T10:00:00Z').project;
 const result=processWhatsAppMessage(project,message.id),report=result.project.reports.at(-1),snapshot=structuredClone(report);
 render(<ClaimEvidencePanel row={{id:'WI-001',projectId:project.id,ref:'A / 01',description:'Cladding',evidence:snapshot,verified:25}} kind="work" projectId={project.id} period="2026-10" revision={1} cutoff="2026-10-31" onClose={()=>{}}/>);
 await user.click(screen.getByText('Match review',{exact:true}));expect(screen.getByText('Saved EAST wall correction.')).toBeTruthy();
 expect(screen.getByText(/A \/ 02.*roof sheeting/)).toBeTruthy();expect(screen.getByText(/A \/ 01.*wall cladding/)).toBeTruthy();expect(report).toEqual(snapshot);
});

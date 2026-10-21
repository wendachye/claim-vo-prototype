import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Building2, Check, CheckCheck, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, Clock3, FileCheck2, FileText, Flag, History, ImagePlus, Info, ListChecks, LockKeyhole, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RotateCcw, Search, ShieldCheck, Upload, X } from 'lucide-react';
import { WORKSPACE_STORE, createProject, resetProject, updateProjectState } from './data/projects.js';
import { getShowcaseProjectId, loadShowcaseWorkspace } from './data/showcase-workspace.js';
import { createDemoProject } from './data/demo-project.js';
import { createProvidedContractDemo, getProvidedContractSample, createSITContractDemo, getSITContractSample } from './data/provided-contract-demo.js';
import { getAreaVOFlags } from './data/drawing-vo.js';
import { resolveAreaEvidenceSource } from './data/drawing-evidence.js';
import { createDrawingProgressDemo } from './data/drawing-progress-demo.js';
import { applyMockContract, DEMO_CONTRACT_PDF } from './data/contract-import.js';
import { ContractUploadFlow } from './components/ContractUploadFlow.jsx';
import { DrawingMappingView } from './components/DrawingMappingView.jsx';
import { getDrawingMapping, installDrawing, saveAreaMapping, removeMappedArea, getAreasForItem, getAreaLinkStatus, snapshotMappedArea } from './data/drawing-mapping.js';
import { clearFormBuffer, clearProjectFormBuffers, contractFormScope, findUnfinishedContractItem } from './data/form-buffer.js';
import { ProjectsView, CreateProjectModal } from './components/ProjectsView.jsx';
import { ProjectOverview, WorkflowNav, SiteViewTabs } from './components/ProjectWorkflow.jsx';
import { ProjectDropdown } from './components/ProjectDropdown.jsx';
import { ContractComparison } from './components/ContractComparison.jsx';
import { ContractFilters, ContractRegister } from './components/ContractRegister.jsx';
import { ReportDrawer } from './components/ReportDrawer.jsx';
import { ProgressFilters, ProgressRegister } from './components/ProgressRegister.jsx';
import { getItemProgressReview } from './data/progress-review.js';
import { WhatsAppView } from './components/WhatsAppView.jsx';
import { VOReviewView } from './components/VOReviewView.jsx';
import { MonthlyClaimView } from './components/MonthlyClaimView.jsx';
import { ClaimPackPreview } from './components/ClaimPackPreview.jsx';
import { toClaimCSV, claimPackFilename } from './data/claim-pack.js';
import { saveClaimDraft, markClaimPrepared } from './data/claims.js';
import { getWhatsAppMessages, processWhatsAppMessage } from './data/whatsapp.js';
import { getVOCases, updateVOReview, VO_STATUS_LABELS } from './data/vo.js';
import { getProjectWorkflow } from './data/workflow.js';
import { getWorkItemSiteMessage } from './data/contract-work-links.js';
import { applySITAreaUpdate } from './data/sit-area-update.js';
import { addSITAreaMessages } from './data/sit-area-messages.js';
import { refreshSITDemoPhotos } from './data/sit-demo-photos.js';
import { isReviewableProgressReport, isUnresolvedProgressReport, needsProgressClarification, requestProgressClarification } from './data/report-status.js';
import { Badge, Button, FormField, Modal, PageHeader, formatMoney as money, formatNumber as num, formatTime as time } from './components/ui.jsx';
import './components/layout-system.css';

const SIZE=8;
const route=()=>['projects','completion','contract','drawing','whatsapp','vo','claims','claim-preview'].includes(location.hash.slice(1).split('?')[0])?location.hash.slice(1).split('?')[0]:'projects';
const routeFilter=()=>route()==='completion'&&new URLSearchParams(location.hash.split('?')[1]).get('filter')==='vo'?'vo':'all';
const routeCompletionArea=()=>route()==='completion'?new URLSearchParams(location.hash.split('?')[1]).get('area'):null;
const routeMessage=()=>route()==='whatsapp'?new URLSearchParams(location.hash.split('?')[1]).get('message'):null;
const routeMessageArea=()=>route()==='whatsapp'?new URLSearchParams(location.hash.split('?')[1]).get('area'):null;
const routeVOArea=()=>route()==='vo'?new URLSearchParams(location.hash.split('?')[1]).get('area'):null;
const routeVOCase=()=>route()==='vo'?new URLSearchParams(location.hash.split('?')[1]).get('case'):null;
const routeClaimDraft=()=>route()==='claim-preview'?new URLSearchParams(location.hash.split('?')[1]).get('draft'):null;
const audit=(action,detail)=>({id:crypto.randomUUID(),action,detail,date:new Date().toISOString(),actor:'Alex Tan · Demo reviewer'});
const waiting=isReviewableProgressReport;
function supersedeWaiting(reports,itemId,replacementId,date,reason){
  const ids=[];const next=reports.map(r=>{if(r.id===replacementId||r.itemId!==itemId||!isUnresolvedProgressReport(r))return r;ids.push(r.id);return {...r,status:'superseded',supersededByReportId:replacementId,supersededAt:date,supersededBy:'Alex Tan · Demo reviewer',supersededReason:reason};});
  return {reports:next,ids};
}
function Empty({clear}){return <div className="empty-state"><Search size={25}/><h3>No matching items</h3><p>Try another reference, description or filter.</p><Button onClick={clear}>Clear filters</Button></div>;}
function Pagination({count,page,total,onChange}){return <div className="table-footer"><span>Showing {count?(page-1)*SIZE+1:0}–{Math.min(page*SIZE,count)} of {count} items</span><div><span>Page {page} of {total}</span><Button className="icon" aria-label="Previous page" disabled={page===1} onClick={()=>onChange(page-1)}><ChevronLeft size={15}/></Button><Button className="icon" aria-label="Next page" disabled={page===total} onClick={()=>onChange(page+1)}><ChevronRight size={15}/></Button></div></div>;}

export function App(){
  const [workspace,setWorkspace]=useState(loadShowcaseWorkspace);
  const showcaseProjectId=getShowcaseProjectId(workspace);
  const project=workspace.projects.find(p=>p.id===workspace.activeProjectId)||workspace.projects[0];
  const s=project;
  const contract=project.contract;
  const set=(updater)=>setWorkspace(old=>updateProjectState(old,project.id,updater));
  const [view,setView]=useState(route);
  const [manageProjects,setManageProjects]=useState(()=>route()==='projects'&&new URLSearchParams(location.hash.split('?')[1]).get('manage')==='1');
  const [voSelection,setVOSelection]=useState(routeVOCase);
  const [voReturnAreaId,setVOReturnAreaId]=useState(routeVOArea);
  const [claimSelection,setClaimSelection]=useState(routeClaimDraft);
  const [completionAreaId,setCompletionAreaId]=useState(routeCompletionArea);
  const [messageSelection,setMessageSelection]=useState(routeMessage);
  const [messageReturnAreaId,setMessageReturnAreaId]=useState(routeMessageArea);
  const [tab,setTab]=useState('items');const [selectedId,select]=useState('WI-001');
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});},[view,project.id,tab]);
  const [search,setSearch]=useState('');const [block,setBlock]=useState('all');const [filter,setFilter]=useState(routeFilter);const [page,setPage]=useState(1);
  const [collapsed,collapse]=useState(false);const [mobile,setMobile]=useState(false);
  const [modal,setModal]=useState(null);const [drawer,setDrawer]=useState(null);const [toast,setToast]=useState(null);const [storageError,setStorageError]=useState(false);
  const [reportItemId,setReportItemId]=useState(null);
  const [inputPreviews,setInputPreviews]=useState({});
  const inputPreviewUrls=useRef(new Map());
  useEffect(()=>()=>{inputPreviewUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  const [drawingPreviews,setDrawingPreviews]=useState({});
  const drawingPreviewUrls=useRef(new Map());
  useEffect(()=>()=>{drawingPreviewUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  useEffect(()=>{try{localStorage.setItem(WORKSPACE_STORE,JSON.stringify(workspace));setStorageError(false);}catch{setStorageError(true);}},[workspace]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{setPage(1);},[search,block,filter]);
  useEffect(()=>{if(view!=='completion')return;const params=new URLSearchParams();if(filter==='vo')params.set('filter','vo');else if(completionAreaId)params.set('area',completionAreaId);const hash=`#completion${params.size?'?'+params.toString():''}`;if(location.hash!==hash)window.history.replaceState(null,'',hash);},[view,filter,completionAreaId]);
  useEffect(()=>{const h=()=>{setView(route());setManageProjects(route()==='projects'&&new URLSearchParams(location.hash.split('?')[1]).get('manage')==='1');setVOSelection(routeVOCase());setVOReturnAreaId(routeVOArea());setClaimSelection(routeClaimDraft());setCompletionAreaId(routeCompletionArea());setMessageSelection(routeMessage());setMessageReturnAreaId(routeMessageArea());setDrawer(null);setModal(null);setSearch('');setBlock('all');setFilter(routeFilter());setPage(1);setMobile(false);};window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h);},[]);
  const notify=(message,error=false)=>setToast({message,error});
  const clear=()=>{setSearch('');setBlock('all');setFilter('all');setCompletionAreaId(null);};
  const nav=(v,initialFilter='all')=>{setMessageSelection(null);setMessageReturnAreaId(null);setView(v);setManageProjects(false);setVOSelection(null);setVOReturnAreaId(null);setClaimSelection(null);location.hash=`${v}${initialFilter==='vo'?'?filter=vo':''}`;clear();setFilter(initialFilter);setPage(1);setDrawer(null);setMobile(false);};
  function openDrawingArea(areaId){nav('drawing');if(areaId)location.hash=`drawing?area=${encodeURIComponent(areaId)}`;window.scrollTo({top:0});}
  function openProgressForArea(areaId){
    if(areaId&&!getDrawingMapping(project).areas.some(area=>area.id===areaId))return notify('Choose an area from this project.',true);
    nav('completion');if(areaId){setCompletionAreaId(areaId);location.hash=`completion?area=${encodeURIComponent(areaId)}`;}window.scrollTo({top:0});
  }
  function selectInboxMessage(messageId){
    if(!getWhatsAppMessages(project).some(message=>message.id===messageId))return;
    setMessageSelection(messageId);
    const params=new URLSearchParams({message:messageId});if(messageReturnAreaId&&getDrawingMapping(project).areas.some(area=>area.id===messageReturnAreaId))params.set('area',messageReturnAreaId);
    window.history.replaceState(null,'',`#whatsapp?${params.toString()}`);
  }
  function openContractWorkItem(itemId){
    const item=s.items.find(entry=>entry.id===itemId);
    if(!item)return notify('Choose a work item from this project.',true);
    nav('contract');select(item.id);setTab('review');
  }
  function openWorkItemMessage(itemId){
    const message=getWorkItemSiteMessage(project,itemId);
    if(!message)return notify('No site message is linked to this work item yet.',true);
    nav('whatsapp');setMessageSelection(message.id);location.hash=`whatsapp?message=${encodeURIComponent(message.id)}`;
  }
  function openAreaEvidence(entry,areaId){
    const source=resolveAreaEvidenceSource(project,areaId,entry.id);
    if(!source)return notify('This update is no longer available for this area.',true);
    if(source.kind==='message'){
      nav('whatsapp');setMessageSelection(source.messageId);setMessageReturnAreaId(areaId);
      location.hash=`whatsapp?${new URLSearchParams({message:source.messageId,area:areaId}).toString()}`;window.scrollTo({top:0});return;
    }
    const report=s.reports.find(report=>source.kind==='report'&&report.id===source.reportId&&(!report.projectId||report.projectId===project.id)&&(!report.projectCode||report.projectCode===project.code));
    if(report){setDrawer({itemId:report.itemId,reportId:report.id});return;}
    notify('The original inbox is unavailable. The saved message remains visible on the drawing.',true);
  }
  function startDrawingProgressDemo(){
    const result=createDrawingProgressDemo(workspace);
    if(result.outcome==='invalid')return notify(result.error||'The demo could not be created.',true);
    setWorkspace(result.workspace);select('');setTab('items');setModal(null);nav('drawing');window.scrollTo({top:0});
    notify('Separate completion demo opened. Select an area, then View in Progress to review its work.');
  }
  function openProjectManager(){nav('projects');setManageProjects(true);location.hash='projects?manage=1';}
  function followNext(next){if(next.route==='claim-preview')return openClaimPack(next.draftId);if(next.route==='vo')return openVO(next.caseId);nav(next.route);}
  function openVO(caseId=null,areaId=null){
    setVOSelection(caseId);setVOReturnAreaId(areaId);setView('vo');
    const params=new URLSearchParams();if(caseId)params.set('case',caseId);if(areaId&&getDrawingMapping(project).areas.some(area=>area.id===areaId))params.set('area',areaId);
    location.hash=`vo${params.size?'?'+params.toString():''}`;clear();setPage(1);setDrawer(null);setModal(null);setMobile(false);
  }
  function openAreaVO(caseId,areaId){
    if(!getAreaVOFlags(project,areaId)?.cases.some(entry=>entry.id===caseId))return notify('This extra-work case is not available for this area.',true);
    openVO(caseId,areaId);window.scrollTo({top:0});
  }
  function openClaimDrafts(){nav('claims');location.hash='claims?tab=drafts';}
  function openClaimPack(draftId){setClaimSelection(draftId);setView('claim-preview');location.hash=`claim-preview?draft=${encodeURIComponent(draftId)}`;clear();setDrawer(null);setModal(null);setMobile(false);window.scrollTo({top:0});}
  function downloadClaimPack(pack){
    if(pack.projectId!==project.id)return notify('Open a claim revision from the selected project.',true);
    const url=URL.createObjectURL(new Blob(['\uFEFF'+toClaimCSV(pack)],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;link.download=claimPackFilename(pack);link.click();URL.revokeObjectURL(url);
    notify('Claim CSV downloaded from the saved revision.');
  }
  function switchProject(id,nextView){
    const next=workspace.projects.find(p=>p.id===id);if(!next)return;
    if(id===project.id){if(nextView)nav(nextView);return;}
    setWorkspace(old=>({...old,activeProjectId:id}));
    setMessageSelection(null);setMessageReturnAreaId(null);if(view==='whatsapp')window.history.replaceState(null,'','#whatsapp');
    setVOSelection(null);setVOReturnAreaId(null);if(view==='vo')window.history.replaceState(null,'','#vo');
    setClaimSelection(null);if(view==='claim-preview')window.history.replaceState(null,'','#claim-preview');
    if(view==='completion')window.history.replaceState(null,'','#completion');if(view==='drawing')window.history.replaceState(null,'','#drawing');
    select(next.items[0]?.id||'');setTab('items');setModal(null);setToast(null);setDrawer(null);clear();setPage(1);setMobile(false);
    if(nextView)nav(nextView);
  }
  function addProject(values){
    if(workspace.projects.some(p=>[p.id,p.code].some(code=>code.toUpperCase()===values.code.toUpperCase())))return notify('Use a unique project code.',true);
    const next=values.template==='sit-original'?createSITContractDemo(values):values.template==='provided'?createProvidedContractDemo(values):values.template==='warehouse'?createDemoProject(values):createProject(values);
    setWorkspace(old=>({...old,activeProjectId:next.id,projects:[...old.projects,next]}));
    select('');setTab('items');setModal(null);nav(['provided','sit-original'].includes(values.template)?'projects':'contract');window.scrollTo({top:0});notify(values.template==='sit-original'?`${next.name} created from the supplied S.I.T. schedule. Site activity and the example claim are simulated.`:values.template==='provided'?`${next.name} created. The fictional contract scenario is ready, with mock progress, VO reviews and an example claim.`:values.template==='warehouse'?`${next.name} created with mock contract items and site messages. Start by checking the highlighted quantity.`:`${next.name} created. Its contract register starts empty.`);
  }
  function importContract(input){
    const result=applyMockContract(workspace,project.id,input);
    if(result.outcome==='invalid')return result;
    const next=result.project;
    clearProjectFormBuffers(next.id);
    if(input.file){
      const previous=inputPreviewUrls.current.get(next.id);if(previous)URL.revokeObjectURL(previous);
      const url=URL.createObjectURL(input.file);inputPreviewUrls.current.set(next.id,url);
      setInputPreviews(old=>({...old,[next.id]:url}));
    }
    setWorkspace(result.workspace);setModal(null);nav('contract');select(next.items.find(item=>item.needsReview)?.id||next.items[0]?.id||'');setTab('review');window.scrollTo({top:0});
    notify(result.createdNew?'Demo extraction opened in a new project. Check the highlighted quantity against the demo PDF.':'Demo work list added. Check the highlighted quantity against the demo PDF.');
    return result;
  }
  function rememberDrawingPreview(file,drawingId){
    const previous=drawingPreviewUrls.current.get(project.id);if(previous)URL.revokeObjectURL(previous);
    if(file){const url=URL.createObjectURL(file);drawingPreviewUrls.current.set(project.id,url);setDrawingPreviews(old=>({...old,[project.id]:{drawingId,url}}));}
    else{drawingPreviewUrls.current.delete(project.id);setDrawingPreviews(old=>{const next={...old};delete next[project.id];return next;});}
  }
  function addDrawing(input){
    const result=installDrawing(project,input);
    if(result.outcome==='invalid')return result;
    rememberDrawingPreview(input.file,result.project.drawingMapping.drawing.id);
    set(()=>result.project);notify('Drawing added. Choose an area and link its contract work items.');return result;
  }
  function saveMappedArea(values){
    const result=saveAreaMapping(project,values);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='updated')set(()=>result.project);
    notify(result.outcome==='unchanged'?'This area is already saved.':'Area mapping saved. Completion and claim values are unchanged.');return result;
  }
  function addSITContractAreas(){
    const result=applySITAreaUpdate(project);
    if(result.outcome==='updated')set(()=>result.project);
    return result;
  }
  function addSITDemoMessages(){
    const result=addSITAreaMessages(project);
    if(result.outcome==='unavailable')return notify(result.error||'Map the S.I.T. contract areas before adding these messages.',true);
    if(result.outcome==='unchanged')return notify('The available area message samples are already saved.');
    set(()=>result.project);
    nav('whatsapp');setMessageSelection(result.firstMessageId);location.hash=`whatsapp?message=${encodeURIComponent(result.firstMessageId)}`;
    notify(`${result.messageCount} demo messages added with photos. Review them before changing progress or flagging extra work.`);
    return result;
  }
  function updateSITDemoPhotos(){
    const result=refreshSITDemoPhotos(project);
    if(result.outcome==='unavailable')return notify(result.error||'These photos are available for the original S.I.T. demo only.',true);
    if(result.outcome==='unchanged')return notify('The demo messages already use matching photos.');
    set(()=>result.project);
    notify('S.I.T. demo photos now match the work described. Earlier illustrations are kept in photo history; completion and saved claims are unchanged.');
    return result;
  }
  function removeArea(areaId){
    const result=removeMappedArea(project,areaId);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='updated')set(()=>result.project);
    notify('Area removed from the map. Original site reports are retained.');return result;
  }
  const currency=contract.currency||'SGD';
  const currencySymbol=currency==='MYR'?'RM':'S$';
  const blocks=[...new Set(s.items.map(i=>i.location).filter(Boolean))];
  const sourceProvided=contract.sourceKind==='provided';
  const needs=s.items.filter(i=>i.needsReview);
  const voCases=getVOCases(project);
  const openVOCs=voCases.filter(entry=>!['approved','rejected'].includes(entry.status));
  const pending=s.reports.filter(r=>!r.vo&&waiting(r));const vos=openVOCs.map(entry=>entry.report);
  function reviewVO(caseId,action,values){
    const result=updateVOReview(project,caseId,action,values);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='unchanged'){notify('This review is already up to date.');return result;}
    set(old=>updateVOReview(old,caseId,action,values).project);
    const messages={save:'QS assessment saved.',clarify:'Marked as needing information. No message was sent.',submit:'Marked awaiting approval. Nothing was sent externally.',approve:'Demo approval recorded. Contract and completion values are unchanged.',reject:'VO rejected. Evidence and decision history are retained.',reopen:'VO review reopened. The previous decision is retained in history.'};
    notify(messages[action]);return result;
  }
  function saveClaim(period,assessment){
    const result=saveClaimDraft(project,period,assessment);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='unchanged'){notify('This assessment is already saved.');return result;}
    set(()=>result.project);
    notify('Monthly claim draft saved in this browser.');return result;
  }
  function prepareClaim(draftId){
    const result=markClaimPrepared(project,draftId);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='unchanged'){notify('This draft is already prepared.');return result;}
    set(()=>result.project);
    notify('Claim marked prepared locally. Nothing was submitted.');return result;
  }
  function reviewReport(report){if(report?.vo)return openVO(report.id);if(report)setDrawer({itemId:report.itemId,reportId:report.id});}
  const whatsappMessages=getWhatsAppMessages(project);
  const workflowCounts=getProjectWorkflow(project).counts;
  const siteAttentionCount=workflowCounts.pendingReports+workflowCounts.newMessages+workflowCounts.clarifications;
  function processMessage(message){
    const result=processWhatsAppMessage(project,message.id);
    if(result.outcome==='invalid')return notify('This message cannot be processed for the selected project.',true);
    if(result.outcome==='duplicate')return notify('Already processed. No duplicate report or progress was added.');
    set(old=>processWhatsAppMessage(old,message.id).project);
    notify(result.outcome==='clarification'?'Marked for clarification. No completion was changed and no message was sent.':message.kind==='vo'?'Possible VO added for QS review with its original message and photo.':`${message.itemId} reported at ${message.completion}% total. Verified progress awaits review.`);
  }
  const latest=(id)=>getItemProgressReview(project,s.items.find(item=>item.id===id)).report;
  const selected=s.items.find(i=>i.id===selectedId)||s.items[0];
  const completionArea=completionAreaId?getDrawingMapping(project).areas.find(area=>area.id===completionAreaId):null;
  const completionItems=view==='completion'&&completionAreaId?s.items.filter(item=>completionArea?.workItemIds.includes(item.id)):s.items;
  const filtered=completionItems.filter(i=>(!search||`${i.id} ${i.ref} ${i.description} ${i.location} ${i.demoArea||''} ${getAreasForItem(project,i.id).map(area=>`${area.code} ${area.name}`).join(' ')}`.toLowerCase().includes(search.toLowerCase()))&&(block==='all'||i.location.includes(block))).filter(i=>filter==='all'||filter==='vo'||(view==='contract'?(filter==='review'?i.needsReview:!i.needsReview):getItemProgressReview(project,i).key===filter));
  const total=Math.max(1,Math.ceil(filtered.length/SIZE));const current=Math.min(page,total);const rows=filtered.slice((current-1)*SIZE,current*SIZE);
  const openItem=(i)=>{select(i.id);setTab('review');};
  function saveItem(values){
    if(s.locked)return notify('Create a revision before editing this baseline.',true);
    const q=values.quantity===''?null:Number(values.quantity),r=values.rate===''?null:Number(values.rate);
    if(!values.description.trim()||!values.unit||q===null||!Number.isFinite(q)||q<0||(selected.pricingType!=='included'&&(r===null||!Number.isFinite(r)||r<0)))return notify('Enter a description, unit and non-negative quantity and rate.',true);
    const amount=selected.pricingType==='measured'?Math.round((q*r+Number.EPSILON)*100)/100:null;
    const source=project.sourceItems.find(i=>i.id===selected.id);
    if(selected.needsReview&&source?.amount!=null&&Math.abs(source.amount-amount)>.011)return notify('The quantity and rate still do not reconcile with the source amount.',true);
    set(old=>({...old,items:old.items.map(i=>i.id===selected.id?{...i,...values,quantity:q,rate:selected.pricingType==='included'?null:r,amount,needsReview:false,rawExtractedQuantity:undefined,reviewedAt:new Date().toISOString()}:i),history:[audit('Contract item confirmed',`${selected.id} · ${num(q)} ${values.unit} · baseline v${old.version}`),...old.history]}));clearFormBuffer(project.id,contractFormScope(selected,s.version,s.locked));setTab('items');notify(`${selected.id} checked and saved. Confirm the work list when all items are checked.`);
  }
  function lock(){const unfinished=findUnfinishedContractItem(project);if(unfinished){setModal(null);openItem(s.items.find(item=>item.id===unfinished));return notify('Save or revert your unfinished contract edits before confirming the work list.',true);}if(!s.items.length)return notify('Add contract items before confirming a baseline.',true);if(needs.length){setModal(null);openItem(needs[0]);return notify('Check the highlighted extraction before confirming the baseline.',true);}set(old=>({...old,locked:true,lockedAt:new Date().toISOString(),history:[audit('Baseline confirmed',`Version ${old.version} · ${old.items.length} sample items`),...old.history]}));setModal(null);notify('Work list confirmed. Continue to site updates to review the worker messages.');}
  function approve(report,percentage,reason){
    const item=s.items.find(i=>i.id===report.itemId),pct=Number(percentage);
    if(!s.locked)return notify('Confirm the contract baseline first.',true);
    if(!item||report.vo||report.completionBasis!=='cumulative')return notify('Resolve the item and completion basis before verification.',true);
    if(needsProgressClarification(report))return notify('This report needs clarification. Add a clearer cumulative update before verifying progress.',true);
    if(!waiting(report))return notify('This report is already reviewed. Completion is unchanged.');
    if(percentage===''||!Number.isFinite(pct)||pct<0||pct>100)return notify('Enter a completion between 0 and 100%.',true);
    if((pct!==report.completion||pct<item.verified)&&!reason.trim())return notify('Add a reason when correcting or reducing progress.',true);
    if(new Date(report.date)<new Date(latest(item.id).date))return notify('A newer report exists. Review the latest report first.',true);
    const verifiedAt=new Date().toISOString();
    set(old=>{const prior=supersedeWaiting(old.reports,item.id,report.id,verifiedAt,'A newer cumulative report was verified. Original observations are retained.');return {...old,items:old.items.map(i=>i.id===item.id?{...i,verified:pct}:i),reports:prior.reports.map(r=>r.id===report.id?{...r,status:'verified',approvedCompletion:pct,reviewReason:reason,verifiedBy:'Alex Tan · Demo supervisor',verifiedAt}:r),history:[audit('Progress verified',`${item.id} · ${item.verified}% → ${pct}% total${reason?` · ${reason}`:''}`),...(prior.ids.length?[audit('Earlier progress reports superseded',`${prior.ids.join(', ')} · replaced by verified report ${report.id}`)]:[]),...old.history]};});setDrawer(null);notify(`${item.id} verified at ${pct}% total. No claim amount was created.`);
  }
  function changeReport(report,action,reason){
    if(report.vo)return openVO(report.id);
    if(action==='clarify'){
      const result=requestProgressClarification(project,report.id,reason);
      if(result.outcome==='invalid')return notify(result.error,true);
      if(result.outcome==='updated')set(old=>requestProgressClarification(old,report.id,reason).project);
      setDrawer(null);return notify('Marked as needing clarification. Contact the worker outside this demo, then add a clearer total-progress update. No message was sent.');
    }
    set(old=>({...old,reports:old.reports.map(r=>r.id===report.id?{...r,status:action==='reject'?'rejected':'needsReview',reviewReason:reason,...(action==='vo'?{vo:true}:{})}:r),history:[audit(action==='vo'?'Possible VO flagged':'Report dismissed',`${report.id}${reason?` · ${reason}`:''}`),...old.history]}));setDrawer(null);notify(action==='vo'?'Possible VO flagged for QS review. No price or claim was approved.':'Report dismissed. Verified progress is unchanged.');if(action==='vo')openVO(report.id);
  }
  function addReport(v){const item=s.items.find(i=>i.id===v.itemId),pct=Number(v.completion);if(!item||v.completion===''||!Number.isFinite(pct)||pct<0||pct>100||!v.message.trim())return notify('Select an item, enter 0–100% and include the source message.',true);const area=v.area||item.demoArea||item.location;const areaLink=getAreaLinkStatus(project,{projectId:project.id,itemId:item.id,area,kind:'progress'});if(areaLink.conflict)return notify(`Area ${areaLink.area.code} is linked to ${areaLink.area.workItemIds.join(', ')}, not ${item.id}. Check the area or work item before adding this report.`,true);const r={id:`DEMO-${Date.now()}`,itemId:item.id,projectId:project.id,projectCode:project.code,area,areaMapping:snapshotMappedArea(areaLink.area),location:item.location,sender:'Demo worker',date:new Date().toISOString(),completion:pct,completionBasis:'cumulative',status:'pending',message:v.message,origin:'simulated',demo:true,vo:false,...(v.photo?{photo:v.photo}:{})};set(old=>{const prior=supersedeWaiting(old.reports,item.id,r.id,r.date,'Replaced by a newer cumulative report. Original observations are retained.');return {...old,items:old.items.map(i=>i.id===item.id?{...i,reported:pct}:i),reports:[...prior.reports,r],history:[audit('Demo site report received',`${item.id} · ${pct}% total`),...(prior.ids.length?[audit('Earlier progress reports superseded',`${prior.ids.join(', ')} · replaced by ${r.id}`)]:[]),...old.history]};});setModal(null);setDrawer({itemId:item.id,reportId:r.id});notify('Demo report added. Verified progress is unchanged.');}
  function exportCSV(){const text=['Project code,Item,Description,Block,Unit,Quantity,Rate,Amount,Reported %,Verified %,Review',...s.items.map(i=>[project.code,i.ref,i.description,i.location,i.unit,i.needsReview?i.rawExtractedQuantity??i.quantity:i.quantity,i.rate??'',i.amount??i.pricingType,i.reported,i.verified,i.needsReview?'Needs review':'Reviewed'].map(v=>`"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`${project.code}-demo-${view}.csv`;a.click();URL.revokeObjectURL(url);notify('Demo register exported as CSV.');}

  const contractOptions=<details className="contract-more"><summary>More options</summary><div><Button className="ghost" icon={Upload} onClick={()=>setModal('upload')}>Upload contract</Button>{s.locked&&<Button className="ghost" icon={Pencil} onClick={()=>setModal('revision')}>Edit contract</Button>}<Button className="ghost" icon={History} onClick={()=>setModal('history')}>Activity</Button></div></details>;

  return <div className={`app-shell ${collapsed?'sidebar-collapsed':''} ${mobile?'mobile-open':''}`}>
    <aside className="sidebar" aria-label="Main navigation"><div className="brand"><div className="brand-icon"><Building2 size={23}/></div><div className="brand-copy"><strong>Claim & VO</strong><span>Project workspace</span></div></div>
      <div className="nav-caption">YOUR PROJECT</div>
      <nav><button className={`nav-item ${view==='projects'?'active':''}`} title="Project overview" onClick={()=>nav('projects')}><Building2 size={18}/><span>Overview</span></button><button className={`nav-item ${['contract','drawing'].includes(view)?'active':''}`} title="Contract" onClick={()=>nav('contract')}><span className="nav-step">1</span><span>Contract</span>{needs.length>0&&<span className="nav-count">{needs.length}</span>}</button><button className={`nav-item ${['whatsapp','completion'].includes(view)?'active':''}`} title="Site updates" onClick={()=>nav('whatsapp')}><span className="nav-step">2</span><span>Site updates</span>{siteAttentionCount>0&&<span className="nav-count">{siteAttentionCount}</span>}</button><button className={`nav-item ${view==='vo'?'active':''}`} title="Extra work" onClick={()=>openVO()}><span className="nav-step">3</span><span>Extra work</span>{openVOCs.length>0&&<span className="nav-count">{openVOCs.length}</span>}</button><button className={`nav-item ${['claims','claim-preview'].includes(view)?'active':''}`} title="Monthly claims" onClick={()=>nav('claims')}><span className="nav-step">4</span><span>Monthly claims</span></button></nav>
      <div className="sidebar-bottom"><button className="nav-item" title="All projects" onClick={openProjectManager}><Building2 size={17}/><span>All projects</span></button><button className="nav-item" title="Help and demo guide" onClick={()=>setModal('guide')}><Info size={17}/><span>Help & demo guide</span></button><button className="nav-item" title="Reset demo" onClick={()=>setModal('reset')}><RotateCcw size={17}/><span>Reset demo</span></button><div className="sidebar-user"><div className="avatar">AT</div><div><strong>Alex Tan</strong><small>Demo reviewer</small></div><ShieldCheck size={17}/></div></div>
    </aside>{mobile&&<div className="mobile-sidebar-overlay" onClick={()=>setMobile(false)}/>}
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><Button className="ghost icon" aria-label="Toggle sidebar" onClick={()=>window.innerWidth<=760?setMobile(!mobile):collapse(!collapsed)}>{collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</Button><span className="topbar-divider"/><ProjectDropdown projects={workspace.projects} activeProjectId={project.id} showcaseProjectId={showcaseProjectId} onSelect={switchProject} onManage={openProjectManager} onCreate={()=>setModal('create')}/><div className="topbar-module"><ChevronRight size={13}/><span>{view==='projects'?(manageProjects?'All projects':'Overview'):view==='contract'?'Contract':view==='drawing'?'Drawing & areas':view==='whatsapp'?'Site updates':view==='vo'?'Extra work':view==='claims'?'Monthly claims':view==='claim-preview'?'Claim preview':'Site progress'}</span></div></div><div className="topbar-right"><button className="demo-mode" onClick={()=>setModal('guide')} title="Demo data saved in this browser"><Info size={12}/>Demo</button><div className="avatar">AT</div></div></header>
    <main className={`page-content${view==='contract'&&tab==='review'?' contract-review-page':''}`}>{storageError&&<div className="notice warning" role="alert">Browser storage is unavailable or full. Edits will not survive a reload.</div>}{!['projects','claim-preview'].includes(view)&&<WorkflowNav project={project} view={view} onNavigate={nav}/>}{['whatsapp','completion'].includes(view)&&<SiteViewTabs view={view} onNavigate={nav} pending={workflowCounts.pendingReports}/>}{view==='projects'?(manageProjects?<ProjectsView projects={workspace.projects} activeProjectId={project.id} showcaseProjectId={showcaseProjectId} onOpen={switchProject} onBack={()=>nav('projects')} onCreate={()=>setModal('create')}/>:<ProjectOverview project={project} onNavigate={nav} onReviewContract={()=>{nav('contract');setTab('review');}} onNext={followNext} onManage={openProjectManager}/>):view==='drawing'?<DrawingMappingView key={project.id} project={project} initialAreaId={new URLSearchParams(location.hash.split('?')[1]).get('area')} previewUrl={drawingPreviews[project.id]?.drawingId===getDrawingMapping(project).drawing?.id?drawingPreviews[project.id]?.url:null} onBack={()=>nav('contract')} onInstall={addDrawing} onSaveArea={saveMappedArea} onAddContractAreas={addSITContractAreas} onAddAreaMessages={addSITDemoMessages} onOpenSiteUpdates={()=>nav('whatsapp')} onRemoveArea={removeArea} onPreviewFile={file=>rememberDrawingPreview(file,getDrawingMapping(project).drawing?.id)} onOpenProgress={openProgressForArea} onOpenContractItem={openContractWorkItem} onOpenEvidence={openAreaEvidence} onOpenVO={openAreaVO} onStartCompletionDemo={startDrawingProgressDemo}/>:view==='whatsapp'?<WhatsAppView key={project.id} project={project} messages={whatsappMessages} initialMessageId={messageSelection} onSelectMessage={selectInboxMessage} onClearMessageSelection={()=>nav('whatsapp')} onBackToDrawing={messageReturnAreaId&&getDrawingMapping(project).areas.some(area=>area.id===messageReturnAreaId)?()=>openDrawingArea(messageReturnAreaId):undefined} onProcess={processMessage} onReview={reviewReport} onOpenVO={openVO} onOpenCompletion={showVo=>nav('completion',showVo?'vo':'all')} onOpenContract={()=>{nav('contract');select(needs[0]?.id||s.items[0]?.id||'');setTab('review');}} onOpenDrawing={openDrawingArea} onOpenContractItem={openContractWorkItem} onAddAreaMessages={addSITDemoMessages} onRefreshDemoPhotos={updateSITDemoPhotos} onNotify={notify}/>:view==='vo'?<VOReviewView key={project.id} project={project} cases={voCases} initialCaseId={voSelection} onSelect={caseId=>openVO(caseId,voReturnAreaId)} onBackToDrawing={voReturnAreaId&&getDrawingMapping(project).areas.some(area=>area.id===voReturnAreaId)?()=>openDrawingArea(voReturnAreaId):undefined} onClearCaseSelection={()=>openVO(null,voReturnAreaId)} onAction={reviewVO} onOpenWhatsApp={()=>nav('whatsapp')} onOpenContract={()=>nav('contract')} onOpenClaims={()=>nav('claims')}/>:view==='claims'?<MonthlyClaimView key={project.id} project={project} initialTab={new URLSearchParams(location.hash.split('?')[1]).get('tab')} onSave={saveClaim} onPrepare={prepareClaim} onOpenCompletion={()=>nav('completion')} onOpenVO={()=>openVO()} onOpenContract={()=>nav('contract')} onPreview={openClaimPack}/>:view==='claim-preview'?<ClaimPackPreview key={`${project.id}-${claimSelection||'none'}`} project={project} draftId={claimSelection} onBack={openClaimDrafts} onDownloadCSV={downloadClaimPack}/> :<><PageHeader title={view==='contract'?(tab==='review'?'Contract review':'Contract'):'Site progress'} description={view==='contract'?(tab==='review'?'Compare this item with the source schedule.':sourceProvided?`Work items from ${contract.reference||'the supplied schedule'}. Compare each item with its source contract.`:'Check the work list, quantities and rates before tracking progress.'):'Worker-reported totals need supervisor verification before claim assessment.'} onBack={view==='contract'&&tab==='review'?()=>setTab('items'):view==='completion'&&completionAreaId?()=>openDrawingArea(completionAreaId):undefined} backLabel={view==='completion'?'Back to drawing':'Back to work items'} actions={view==='contract'?(tab==='review'?null:<>{s.locked?<Button className="primary" icon={ArrowRight} onClick={()=>nav('whatsapp')}>Continue to site updates</Button>:<Button disabled={!s.items.length} className="primary" icon={CheckCheck} onClick={()=>needs.length?openItem(needs[0]):setModal('lock')}>{needs.length?`Review ${needs.length} item${needs.length===1?'':'s'}`:'Confirm work list'}</Button>}</>):<><Button onClick={()=>openDrawingArea(completionAreaId)}>Drawing status</Button><Button disabled={!s.items.length} icon={Plus} onClick={()=>{setReportItemId(null);setModal('report');}}>Add demo update</Button></>}/>
      {view==='contract'&&contract.demoImport&&<details className="contract-import-details"><summary><Badge tone="blue">Demo extraction</Badge><span>6 sample work items · {contract.demoImport.fileName}</span></summary><div><p>{contract.demoImport.inputKind==='upload'?'The selected PDF is preview only. This work list uses the fictional demo contract; the selected PDF was not read.':'The work list is a simulated result from the fictional demo contract.'}</p><div className="contract-import-links"><a className="button" href={DEMO_CONTRACT_PDF} target="_blank" rel="noreferrer">View demo source PDF <ArrowUpRight size={14}/></a>{contract.demoImport.inputKind==='upload'&&(inputPreviews[project.id]?<a className="button" href={inputPreviews[project.id]} target="_blank" rel="noreferrer">Preview selected PDF <ArrowUpRight size={14}/></a>:<span>Selected-file preview ends when the page is refreshed. The demo source stays available.</span>)}</div></div></details>}
      {view==='contract'&&tab!=='review'&&<div className="contract-summary"><div><Badge tone={s.locked?'green':'amber'}>{s.locked?'Contract checked':needs.length?`${needs.length} to check`:'Review work list'}</Badge><span className="contract-summary-value">{s.items.length} work items</span><span className="contract-summary-value">Contract value <strong>{contract.totalAmount==null?'Not added':`${currencySymbol}${money(contract.totalAmount)}`}</strong></span></div><div><Button className="ghost" onClick={()=>setModal('project')}>Contract details</Button>{contractOptions}</div></div>}
      {view==='completion'&&completionAreaId&&<div className="notice info"><Info size={16}/><span>{completionArea?<>Area <strong>{completionArea.code} · {completionArea.name}</strong> — showing {completionItems.length} linked work item{completionItems.length===1?'':'s'}. Totals are for each whole work item.</>:<>This area is no longer available in this project. Choose another area on the drawing or show all work items.</>}</span><Button onClick={clear}>Show all work items</Button></div>}
      {!s.items.length?<div className="empty-state project-empty"><FileText size={32}/><h3>No contract items yet</h3><p>Choose a PDF or use the demo contract, then review a simulated extracted work list.</p><Button className="primary" icon={Upload} onClick={()=>setModal('upload')}>Upload contract</Button><Button onClick={()=>setModal('create')}>Create a mock project</Button></div>:<>
      {view==='contract'&&tab!=='review'&&<div className="tab-bar"><button className={`tab-button ${tab==='items'?'active':''}`} onClick={()=>setTab('items')}>Work items <span className="tab-count">{s.items.length}</span></button><button className={`tab-button ${tab==='review'?'active':''}`} onClick={()=>setTab('review')}>Compare with contract {needs.length>0&&<span className="review-dot"/>}</button><button className="tab-button" onClick={()=>nav('drawing')}>Drawing &amp; areas</button></div>}
      {view==='contract'&&tab==='review'?<><div className="review-navigation"><div className="review-context"><Button className="ghost" onClick={()=>setModal('project')}>Contract details</Button>{contractOptions}</div><div className="review-item-navigation"><span className="cell-secondary">Item {s.items.indexOf(selected)+1} of {s.items.length}</span><Button className="icon" aria-label="Previous item" disabled={s.items.indexOf(selected)===0} onClick={()=>select(s.items[s.items.indexOf(selected)-1].id)}><ChevronLeft size={15}/></Button><Button className="icon" aria-label="Next item" disabled={s.items.indexOf(selected)===s.items.length-1} onClick={()=>select(s.items[s.items.indexOf(selected)+1].id)}><ChevronRight size={15}/></Button></div></div><ContractComparison project={project} item={selected} onSave={saveItem} nextLabel={s.items.indexOf(selected)===s.items.length-1?'Back to work items':undefined} onNext={()=>{const index=s.items.indexOf(selected);if(index===s.items.length-1)setTab('items');else select(s.items[index+1].id);}}/></>:<>
        {view==='completion'?<ProgressFilters project={project} items={completionItems} search={search} block={block} filter={filter} blocks={blocks} onSearch={setSearch} onBlock={setBlock} onFilter={setFilter} onClear={clear} onActivity={()=>setModal('history')} onExtraWork={()=>openVO()} extraWorkCount={voCases.length}/>:<ContractFilters items={s.items} resultCount={filtered.length} search={search} block={block} filter={filter} blocks={blocks} onSearch={setSearch} onBlock={setBlock} onFilter={setFilter} onClear={clear} onExport={exportCSV}/>}
        {view==='contract'&&needs.length>0&&<div className="notice warning"><CircleAlert size={16}/><span><strong>{needs.length} item needs your attention.</strong> A quantity differs from the source schedule.</span><button onClick={()=>openItem(needs[0])}>Review item <ArrowRight size={14}/></button></div>}
        {view==='completion'&&!s.locked&&<div className="notice info"><Info size={16}/><span>Check and confirm the contract work list before verifying progress.</span><button onClick={()=>{nav('contract');setTab('review');}}>Review contract <ArrowRight size={14}/></button></div>}
        <div className="table-shell"><div className="table-scroll">{view==='contract'?<ContractRegister project={project} items={rows} currencySymbol={currencySymbol} onReview={openItem} onOpenMessage={openWorkItemMessage}/>:filter==='vo'?<table className="data-table completion-table"><thead><tr><th>Work item</th><th>Location / area</th><th>Reported total</th><th>Verified total</th><th>Review status</th><th>Latest update</th><th/></tr></thead><tbody>{vos.filter(r=>(!search||r.message.toLowerCase().includes(search.toLowerCase()))&&(block==='all'||r.location.includes(block))).map(r=>{const matched=s.items.find(i=>i.id===r.itemId);return <tr className="table-row" key={r.id} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')openVO(r.id);}} onClick={()=>openVO(r.id)}><td><div className="cell-primary">{voCases.find(entry=>entry.id===r.id)?.title||matched?.description||r.scopeLabel||(r.id==='DEMO-REPORT-003'?'Extra access platform':'Possible extra work')}</div><div className="cell-secondary">{matched?`${matched.id} · ${matched.ref}`:`Unmatched scope · ${r.id}`}</div></td><td>{r.location} / {r.area}</td><td>—</td><td>—</td><td><Badge tone="violet">{VO_STATUS_LABELS[voCases.find(entry=>entry.id===r.id)?.status]||'Flagged'}</Badge></td><td>{time(r.date)}</td><td><ChevronRight size={16}/></td></tr>;})}</tbody></table>:<ProgressRegister project={project} items={rows} onReview={(item,report)=>setDrawer({itemId:item.id,reportId:report?.id})}/>}{(filter==='vo'?vos.filter(r=>(!search||r.message.toLowerCase().includes(search.toLowerCase()))&&(block==='all'||r.location.includes(block))).length===0:rows.length===0)&&<Empty clear={clear}/>}</div>{filter!=='vo'&&<Pagination count={filtered.length} page={current} total={total} onChange={setPage}/>}</div>
        {view==='contract'&&<div className="tips-row"><Info size={14}/><span>{view==='contract'?(sourceProvided?'Representative subset only. Included and rate-only entries are preserved; sample rows do not add up to the full contract sum.':'Illustrative quantities and rates for this demo project.'):'Reported progress needs supervisor verification. Percentages do not automatically create claim values.'}</span></div>}
      </>}
    </>}
    </>}
    {view==='completion'&&s.items.length>0&&<div className="next-module"><div><strong>Next: prepare your monthly claim</strong><p>Use checked progress and approved extra work. You will review the quantities and amounts.</p></div><Button onClick={()=>nav('claims')}>Open monthly claims<ArrowRight size={14}/></Button></div>}
    </main></div>
    {toast&&<div className={`toast ${toast.error?'error':''}`} role="status">{toast.error?<CircleAlert size={17}/>:<CheckCheck size={17}/>}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={15}/></button></div>}
    {drawer&&<ReportDrawer key={`${project.id}-${drawer.reportId||drawer.itemId}`} projectCode={project.code} item={s.items.find(i=>i.id===drawer.itemId)} report={s.reports.find(r=>r.id===drawer.reportId)} locked={s.locked} onClose={()=>setDrawer(null)} onApprove={approve} onChange={changeReport} onReviewVO={r=>openVO(r.id)} onReplay={r=>{if(s.reports.some(x=>x.id===r.id))notify('Duplicate event ignored. Report and completion totals are unchanged.');}} onAdd={itemId=>{setReportItemId(itemId||null);setDrawer(null);setModal('report');}}/>}
    {modal==='lock'&&<Modal title="Confirm work list" description={`${project.code} · Version ${s.version}`} onClose={()=>setModal(null)} footer={<><Button onClick={()=>setModal(null)}>Cancel</Button><Button className="primary" icon={needs.length?ArrowRight:LockKeyhole} onClick={lock}>{needs.length?'Review unresolved item':'Confirm work list'}</Button></>}><div className={`notice ${needs.length?'warning':'success'}`}><ShieldCheck size={17}/><span>{needs.length?`${needs.length} item needs a source check before the baseline can be confirmed.`:`All ${s.items.length} representative items have been reviewed.`}</span></div><p>Confirming locks this version for progress review. Later edits require a new baseline revision.</p></Modal>}
    {modal==='revision'&&<Modal title="Create a baseline revision" onClose={()=>setModal(null)} footer={<><Button onClick={()=>setModal(null)}>Cancel</Button><Button className="primary" onClick={()=>{set(old=>({...old,baselines:[...old.baselines,{version:old.version,items:structuredClone(old.items),date:old.lockedAt}],locked:false,version:old.version+1,history:[audit('Baseline revision created',`Version ${old.version+1}`),...old.history]}));setModal(null);notify('New editable revision created. Previous baseline retained locally.');}}>Create v{s.version+1}</Button></>}><p>Open a new editable version. The previous baseline snapshot and progress decisions remain in local history.</p></Modal>}
    {modal==='reset'&&<Modal title="Reset this project demo?" onClose={()=>setModal(null)} footer={<><Button onClick={()=>setModal(null)}>Cancel</Button><Button className="danger" icon={RotateCcw} onClick={()=>{clearProjectFormBuffers(project.id);rememberDrawingPreview(null);set(old=>resetProject(old));setModal(null);nav('projects');setDrawer(null);select(project.sourceItems[0]?.id||'');setTab('items');clear();notify(`${project.name} restored. Other projects are unchanged.`);}}>Reset demo</Button></>}><p>Restore only {project.name}’s sample rows, reports and review history, and clear its drawings and area mappings. Other projects and original source files are unaffected.</p></Modal>}
    {modal==='guide'&&<Modal title="From contract to claim" description="Choose a project in the top bar. Every step uses that project." onClose={()=>setModal(null)}><ol className="guide-list"><li><strong>Contract:</strong> check the work items, confirm the list and map site areas under Drawing &amp; areas.</li><li><strong>Site updates:</strong> review worker messages, then verify progress in the Progress tab.</li><li><strong>Extra work:</strong> review additions and record their approval when required.</li><li><strong>Monthly claims:</strong> choose work, enter totals, review and export a saved claim.</li></ol><div className="notice info"><Info size={16}/><span>This is a local demo. AI, WhatsApp and backend services are not connected. Nothing is submitted or sent externally.</span></div><p style={{marginTop:14,fontSize:12,color:'#64748b'}}>Contract values are {sourceProvided?'from the supplied sample':'illustrative demo values'}. Site reports and approval records are simulated.</p></Modal>}
    {modal==='project'&&<Modal title={project.name} description={`${project.code} · ${project.country}`}  onClose={()=>setModal(null)}><div className="detail-grid">{[['Reference',contract.reference],['Main contractor',contract.mainContractor],['Subcontractor',contract.subcontractor],['Contract date',contract.dateLabel||'Not added'],['Declared sum',contract.totalAmount==null?'Not added':`${currency} ${money(contract.totalAmount)}`],['Sample scope',contract.sampleNote||'Empty register']].map(([label,value])=><div className="detail-block" key={label}><div className="detail-label">{label}</div><div className="detail-value">{value}</div></div>)}</div><div className="notice info"><Info size={16}/><span>{contract.pricingNote||'Contract extraction will be connected later. Each project has separate records in this browser.'}</span></div></Modal>}
    {modal==='history'&&<Modal title="Activity history" description={`${project.code} · Local demo actions`} onClose={()=>setModal(null)}>{s.history.length?<div className="activity-list">{s.history.map(h=><div className="activity-item" key={h.id}><History size={16}/><section><strong>{h.action}</strong><p>{h.detail}</p><small>{time(h.date)} · {h.actor}</small></section></div>)}</div>:<div className="empty-state"><History size={25}/><h3>No activity yet</h3><p>Contract checks and progress decisions appear here.</p></div>}</Modal>}

    {modal==='create'&&<CreateProjectModal projects={workspace.projects} providedContract={getProvidedContractSample()} originalContract={getSITContractSample()} onClose={()=>setModal(null)} onCreate={addProject}/>}
    {modal==='report'&&s.items.length>0&&<AddReport key={project.id} project={project} items={s.items} initialItemId={reportItemId} onClose={()=>setModal(null)} onSave={addReport} notify={notify}/>}
    {modal==='upload'&&<ContractUploadFlow key={project.id} project={project} onClose={()=>setModal(null)} onApply={importContract}/>}
  </div>;
}

function AddReport({project,items,initialItemId,onClose,onSave,notify}){
  const first=items.find(item=>item.id===initialItemId)||items[0];
  const reportArea=item=>getAreasForItem(project,item.id)[0]?.code?`Area ${getAreasForItem(project,item.id)[0].code}`:item.demoArea||item.location;
  const [id,setId]=useState(first.id),[pct,setPct]=useState('75'),[area,setArea]=useState(reportArea(first)),[message,setMessage]=useState(`${project.code} | ${first.location} | ${reportArea(first)} | ${first.id} | COMPLETE=75% TOTAL`),[photo,setPhoto]=useState(null);
  const choose=(v)=>{setId(v);const i=items.find(x=>x.id===v);setArea(reportArea(i));setMessage(`${project.code} | ${i.location} | ${reportArea(i)} | ${v} | COMPLETE=${pct}% TOTAL`);};
  function attach(e){const f=e.target.files?.[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>2500000)return notify('Choose a JPEG, PNG or WebP smaller than 2.5 MB for this local demo.',true);const r=new FileReader();r.onload=()=>setPhoto(r.result);r.readAsDataURL(f);}
  return <Modal title="Add a demo site update" description="Simulated incoming report · no message is sent" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button className="primary" icon={Plus} onClick={()=>onSave({itemId:id,completion:pct,area,message,photo})}>Add for review</Button></>}><div className="field-grid"><FormField className="field-full" label="Work item"><select className="form-select" aria-label="Demo report work item" value={id} onChange={e=>choose(e.target.value)}>{items.map(i=><option key={i.id} value={i.id}>{i.id} · {i.description}</option>)}</select></FormField><FormField label="Area"><input className="form-input" aria-label="Demo report area" value={area} onChange={e=>{const value=e.target.value;setArea(value);setMessage(old=>old.replace(` | ${area} | `,` | ${value} | `));}}/></FormField><FormField label="Total complete (%)"><input className="form-input" aria-label="Demo completion percentage" type="number" min="0" max="100" value={pct} onChange={e=>{setPct(e.target.value);setMessage(m=>m.replace(/COMPLETE=[\d.]+%/,`COMPLETE=${e.target.value}%`));}}/></FormField><FormField className="field-full" label="Original message"><textarea className="form-textarea" aria-label="Demo report message" rows={3} value={message} onChange={e=>setMessage(e.target.value)}/></FormField><label className="field-full photo-upload"><ImagePlus size={18}/>{photo?'Photo attached · choose another':'Attach a demo photo (optional)'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={attach}/></label>{photo&&<img className="photo-thumb" src={photo} alt="Demo attachment preview"/>}</div><div className="notice info"><Info size={16}/><span>Structured inputs set the proposed fields. AI parsing is not connected. The report stays pending until verified.</span></div></Modal>;
}

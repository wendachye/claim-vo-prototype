import { useEffect, useRef, useState, type ChangeEvent, type ComponentProps } from 'react';
import type { Project, WorkItem, SiteReport, WhatsAppMessage, AttentionTask, AttentionTarget, ProjectValues } from './types/domain';
import type { ClaimAssessmentInput, ClaimDraft, ClaimPack } from './types/claims';
type ProjectUpdater = (project: Project) => Project;
type ReportSelection = { itemId?: string | null; reportId?: string };
type ReportInput = { itemId: string; completion: string; area: string; message: string; photo: string | null };
type ToastState = { message: string; error: boolean };
type ContractItemValues = { description: string; unit: string; quantity: string; rate: string; location: string };
type DrawingInput = Parameters<typeof installDrawing>[1] & { file?: File };

import { ArrowLeft, ArrowRight, ArrowUpRight, Building2, Check, CheckCheck, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, Clock3, FileCheck2, FileText, Flag, History, ImagePlus, Info, ListChecks, LockKeyhole, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RotateCcw, Search, ShieldCheck, Upload, X } from 'lucide-react';
import { WORKSPACE_STORE, createProject, resetProject, updateProjectState } from './data/projects.ts';
import { getShowcaseProjectId, loadShowcaseWorkspace } from './data/showcase-workspace.ts';
import { createDemoProject } from './data/demo-project.ts';
import { createClaimExamplesDemo } from './data/claim-examples-demo.ts';
import { createProvidedContractDemo, getProvidedContractSample, createSITContractDemo, getSITContractSample } from './data/provided-contract-demo.ts';
import { getAreaVOFlags } from './data/drawing-vo.ts';
import { resolveAreaEvidenceSource } from './data/drawing-evidence.ts';
import { createDrawingProgressDemo } from './data/drawing-progress-demo.ts';
import { applyMockContract, DEMO_CONTRACT_PDF } from './data/contract-import.ts';
import { ContractUploadFlow } from './components/ContractUploadFlow';
import { ContractRevisionForm } from './components/ContractRevisionForm';
import { ContractVersionHistory } from './components/ContractVersionHistory';
import { ContractChecks } from './components/ContractChecks';
import { getContractChecks } from './data/contract-checks.ts';
import { getContractTotalReview, saveContractTotalReview } from './data/contract-total-review.ts';
import { claimBasisProduct } from './data/claim-basis.ts';
import { createContractRevision, confirmContractBaseline } from './data/contract-versions.ts';
import { DrawingMappingView } from './components/DrawingMappingView';
import { getDrawingMapping, installDrawing, saveAreaMapping, removeMappedArea, getAreasForItem, getAreaLinkStatus, snapshotMappedArea } from './data/drawing-mapping.ts';
import { readFormBuffer, clearFormBuffer, clearProjectFormBuffers, contractFormScope, findUnfinishedContractItem } from './data/form-buffer.ts';
import { ProjectsView, CreateProjectModal } from './components/ProjectsView';
import { ProjectOverview, SiteViewTabs, WorkflowNav } from './components/ProjectWorkflow';
import { ProjectDropdown } from './components/ProjectDropdown';
import { ActionMenu } from './components/ActionMenu';
import { AttentionNotifications } from './components/AttentionNotifications';
import { ContractComparison } from './components/ContractComparison';
import { ContractFilters, ContractRegister } from './components/ContractRegister';
import { ReportDrawer } from './components/ReportDrawer';
import { ProgressFilters, ProgressRegister } from './components/ProgressRegister';
import { getItemProgressReview, verifyProgressReport, addProgressReport } from './data/progress-review.ts';
import { getItemAreaAllocation, getItemAreaRollup, syncAreaItemProgress } from './data/area-allocations.ts';
import { createAreaSplitDemo } from './data/area-split-demo.ts';
import { createAreaAliasDemo } from './data/area-alias-demo.ts';
import { createMessageMatchDemo } from './data/message-match-demo.ts';
import { saveMessageMatchReview } from './data/message-match.ts';
import { WhatsAppView } from './components/WhatsAppView';
import { VOReviewView } from './components/VOReviewView';
import { MonthlyClaimView } from './components/MonthlyClaimView';
import { ClaimStatusTracker } from './components/ClaimStatusTracker';
import { ClaimPackPreview } from './components/ClaimPackPreview';
import { toClaimCSV, claimPackFilename } from './data/claim-pack.ts';
import { saveClaimDraft, markClaimPrepared } from './data/claims.ts';
import { recordClaimStage } from './data/claim-tracking.ts';
import { getClaimPeriodLock } from './data/claim-actions.ts';
import { saveClaimRevision, getClaimRevisionContext } from './data/claim-revisions.ts';
import { getWhatsAppMessages, processWhatsAppMessage } from './data/whatsapp.ts';
import { saveMessageClarificationRequest, saveMockClarificationReply } from './data/whatsapp-clarification.ts';
import { getVOCases, getVOClaimEligibility, updateVOReview } from './data/vo.ts';
import { createManualVO } from './data/manual-vo.ts';
import { getProjectWorkflow } from './data/workflow.ts';
import { getProjectAttention } from './data/project-attention.ts';
import { getProjectOverview } from './data/project-overview.ts';
import { getWorkItemSiteMessage } from './data/contract-work-links.ts';
import { applySITAreaUpdate } from './data/sit-area-update.ts';
import { addSITAreaMessages } from './data/sit-area-messages.ts';
import { refreshSITDemoPhotos } from './data/sit-demo-photos.ts';
import { isReviewableProgressReport, isUnresolvedProgressReport, needsProgressClarification, requestProgressClarification } from './data/report-status.ts';
import { Badge, Button, FormField, Modal, SelectField, PageHeader, formatMoney as money, formatNumber as num, formatTime as time } from './components/ui';
import './components/layout-system.css';

const SIZE=8;
const legacyExtraWorkRoute=()=>location.hash.slice(1).split('?')[0]==='completion'&&new URLSearchParams(location.hash.split('?')[1]).get('filter')==='vo';
const route=()=>legacyExtraWorkRoute()?'vo':['projects','completion','contract','drawing','whatsapp','vo','claims','claim-preview','claim-status'].includes(location.hash.slice(1).split('?')[0])?location.hash.slice(1).split('?')[0]:'projects';
function canonicalizeLegacyExtraWork(){
  if(!legacyExtraWorkRoute())return;
  const original=new URLSearchParams(location.hash.split('?')[1]);const params=new URLSearchParams();
  for(const key of ['case','area','from'])if(original.get(key))params.set(key,original.get(key)!);
  window.history.replaceState(null,'',`#vo${params.size?'?'+params.toString():''}`);
}
const routeCompletionArea=()=>route()==='completion'?new URLSearchParams(location.hash.split('?')[1]).get('area'):null;
const routeCompletionItem=()=>route()==='completion'?new URLSearchParams(location.hash.split('?')[1]).get('item'):null;
const routeCompletionReport=()=>route()==='completion'?new URLSearchParams(location.hash.split('?')[1]).get('report'):null;
const routeClaimEditDraft=()=>route()==='claims'?new URLSearchParams(location.hash.split('?')[1]).get('draft'):null;
const routeAttentionReturn=()=>['contract','whatsapp','completion','vo','claims','claim-preview','claim-status'].includes(route())&&new URLSearchParams(location.hash.split('?')[1]).get('from')==='overview';
const routeCompletionMessage=()=>route()==='completion'?new URLSearchParams(location.hash.split('?')[1]).get('message'):null;
const routeContractItem=()=>route()==='contract'?new URLSearchParams(location.hash.split('?')[1]).get('item'):null;
const routeContractVO=()=>route()==='contract'?new URLSearchParams(location.hash.split('?')[1]).get('vo'):null;
const routeContractArea=()=>route()==='contract'?new URLSearchParams(location.hash.split('?')[1]).get('area'):null;
const routeClaimRevision=()=>route()==='claims'?new URLSearchParams(location.hash.split('?')[1]).get('revise'):null;
const routeClaimVO=()=>route()==='claims'?new URLSearchParams(location.hash.split('?')[1]).get('vo'):null;
const routeMessage=()=>route()==='whatsapp'?new URLSearchParams(location.hash.split('?')[1]).get('message'):null;
const routeMessageArea=()=>route()==='whatsapp'?new URLSearchParams(location.hash.split('?')[1]).get('area'):null;
const routeVOArea=()=>route()==='vo'?new URLSearchParams(location.hash.split('?')[1]).get('area'):null;
const routeVOCase=()=>route()==='vo'?new URLSearchParams(location.hash.split('?')[1]).get('case'):null;
const routeClaimDraft=()=>['claim-preview','claim-status'].includes(route())?new URLSearchParams(location.hash.split('?')[1]).get('draft'):null;
const routeClaimPreviewFrom=()=>route()==='claim-preview'&&new URLSearchParams(location.hash.split('?')[1]).get('from')==='status';
const audit=(action: string,detail: string)=>({id:crypto.randomUUID(),action,detail,date:new Date().toISOString(),actor:'Alex Tan · Demo reviewer'});
const waiting=isReviewableProgressReport;
function Empty({clear}: { clear: () => void }){return <div className="empty-state"><Search size={25}/><h3>No matching items</h3><p>Try another reference, description or filter.</p><Button onClick={clear}>Clear filters</Button></div>;}
function Pagination({count,page,total,onChange}: { count: number; page: number; total: number; onChange: (page: number) => void }){return <div className="table-footer"><span>Showing {count?(page-1)*SIZE+1:0}–{Math.min(page*SIZE,count)} of {count} items</span><div><span>Page {page} of {total}</span><Button className="icon" aria-label="Previous page" disabled={page===1} onClick={()=>onChange(page-1)}><ChevronLeft size={15}/></Button><Button className="icon" aria-label="Next page" disabled={page===total} onClick={()=>onChange(page+1)}><ChevronRight size={15}/></Button></div></div>;}

export function App(){
  const [workspace,setWorkspace]=useState(loadShowcaseWorkspace);
  const showcaseProjectId=getShowcaseProjectId(workspace);
  const project=workspace.projects.find(p=>p.id===workspace.activeProjectId)||workspace.projects[0];
  const s=project;
  const contract=project.contract;
  const attentionTasks=getProjectAttention(project);
  const set=(updater: ProjectUpdater)=>setWorkspace(old=>updateProjectState(old,project.id,updater));
  const [view,setView]=useState(route);
  const [manageProjects,setManageProjects]=useState(()=>route()==='projects'&&new URLSearchParams(location.hash.split('?')[1]).get('manage')==='1');
  const [voSelection,setVOSelection]=useState(routeVOCase);
  const [voReturnAreaId,setVOReturnAreaId]=useState(routeVOArea);
  const [claimSelection,setClaimSelection]=useState(routeClaimDraft);
  const [claimPreviewFromStatus,setClaimPreviewFromStatus]=useState(routeClaimPreviewFrom);
  const [claimVOSelection,setClaimVOSelection]=useState(routeClaimVO);
  const [claimRevisionSelection,setClaimRevisionSelection]=useState(routeClaimRevision);
  const [claimEditSelection,setClaimEditSelection]=useState(routeClaimEditDraft);
  const [attentionReturn,setAttentionReturn]=useState(routeAttentionReturn);
  const [attentionOpen,setAttentionOpen]=useState(false);
  const [contractChecksOpen,setContractChecksOpen]=useState(false);
  const [totalReviewRequest,setTotalReviewRequest]=useState<{ projectId: string | null; version: number | null; tick: number }>({projectId:null,version:null,tick:0});
  const [totalReviewEditing,setTotalReviewEditing]=useState(false);
  useEffect(()=>{setTotalReviewEditing(false);},[project.id,project.version,view]);
  useEffect(()=>{setContractChecksOpen(false);setTotalReviewRequest({projectId:null,version:null,tick:0});},[project.id]);
  useEffect(()=>{setAttentionOpen(false);},[view,project.id]);
  const [completionReportId,setCompletionReportId]=useState(routeCompletionReport);
  const [completionAreaId,setCompletionAreaId]=useState(routeCompletionArea);
  const [completionItemId,setCompletionItemId]=useState(routeCompletionItem);
  const [completionMessageId,setCompletionMessageId]=useState(routeCompletionMessage);
  const [contractReturnVOId,setContractReturnVOId]=useState(routeContractVO);
  const [contractReturnAreaId,setContractReturnAreaId]=useState(routeContractArea);
  const [messageSelection,setMessageSelection]=useState(routeMessage);
  const [messageReturnAreaId,setMessageReturnAreaId]=useState(routeMessageArea);
  const [tab,setTab]=useState(()=>routeContractItem()?'review':'items');const [selectedId,select]=useState(()=>routeContractItem()||'WI-001');
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});},[view,project.id,tab]);
  useEffect(()=>{if(view!=='contract'||tab!=='review'||!s.items.some(item=>item.id===selectedId))return;const params=new URLSearchParams(location.hash.split('?')[1]);if(params.has('item')&&params.get('item')!==selectedId){params.set('item',selectedId);window.history.replaceState(null,'',`#contract?${params.toString()}`);}},[view,tab,selectedId,project.id]);
  const [search,setSearch]=useState('');const [block,setBlock]=useState('all');const [filter,setFilter]=useState('all');const [page,setPage]=useState(1);
  const [collapsed,collapse]=useState(false);const [mobile,setMobile]=useState(false);
  const [modal,setModal]=useState<string | null>(null);const [drawer,setDrawer]=useState<ReportSelection | null>(null);const [toast,setToast]=useState<ToastState | null>(null);const [storageError,setStorageError]=useState(false);
  const [reportItemId,setReportItemId]=useState<string | null>(null);
  const [inputPreviews,setInputPreviews]=useState<Record<string, string>>({});
  const inputPreviewUrls=useRef(new Map<string, string>());
  useEffect(()=>()=>{inputPreviewUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  const [drawingPreviews,setDrawingPreviews]=useState<Record<string, { drawingId: string; url: string }>>({});
  const drawingPreviewUrls=useRef(new Map<string, string>());
  useEffect(()=>()=>{drawingPreviewUrls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  useEffect(()=>{try{localStorage.setItem(WORKSPACE_STORE,JSON.stringify(workspace));setStorageError(false);}catch{setStorageError(true);}},[workspace]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{setPage(1);},[search,block,filter]);
  useEffect(()=>{if(view!=='completion')return;const params=new URLSearchParams();if(completionAreaId)params.set('area',completionAreaId);if(completionItemId)params.set('item',completionItemId);if(completionMessageId)params.set('message',completionMessageId);if(completionReportId)params.set('report',completionReportId);if(attentionReturn)params.set('from','overview');const hash=`#completion${params.size?'?'+params.toString():''}`;if(location.hash!==hash)window.history.replaceState(null,'',hash);},[view,filter,completionAreaId,completionItemId,completionMessageId,completionReportId,attentionReturn]);
  useEffect(()=>{canonicalizeLegacyExtraWork();const h=()=>{canonicalizeLegacyExtraWork();setAttentionOpen(false);setView(route());setManageProjects(route()==='projects'&&new URLSearchParams(location.hash.split('?')[1]).get('manage')==='1');setVOSelection(routeVOCase());setVOReturnAreaId(routeVOArea());setClaimSelection(routeClaimDraft());setClaimPreviewFromStatus(routeClaimPreviewFrom());setClaimVOSelection(routeClaimVO());setClaimRevisionSelection(routeClaimRevision());setClaimEditSelection(routeClaimEditDraft());setAttentionReturn(routeAttentionReturn());setCompletionReportId(routeCompletionReport());setContractReturnVOId(routeContractVO());setContractReturnAreaId(routeContractArea());if(routeContractItem()){select(routeContractItem()!);setTab('review');}setCompletionAreaId(routeCompletionArea());setCompletionItemId(routeCompletionItem());setCompletionMessageId(routeCompletionMessage());setMessageSelection(routeMessage());setMessageReturnAreaId(routeMessageArea());if(route()!=='completion'||!routeCompletionReport())setDrawer(null);setModal(null);setSearch('');setBlock('all');setFilter('all');setPage(1);setMobile(false);};window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h);},[]);
  const completionReport=completionReportId?project.reports.find(entry=>entry.id===completionReportId&&!entry.vo&&(!completionItemId||entry.itemId===completionItemId)&&(!entry.projectId||entry.projectId===project.id)&&(!entry.projectCode||entry.projectCode===project.code)&&project.items.some(item=>item.id===entry.itemId)&&(!completionAreaId||getDrawingMapping(project).areas.some(area=>area.id===completionAreaId&&area.workItemIds.includes(entry.itemId!)&&(!entry.areaProgress||entry.areaProgress.areaId===area.id)))):null;
  useEffect(()=>{
    if(view!=='completion'||!completionReportId)return;
    setDrawer(completionReport?{itemId:completionReport.itemId,reportId:completionReport.id}:null);
  },[view,completionReportId,completionItemId,completionAreaId,project.id]);
  const notify=(message: string,error=false)=>setToast({message,error});
  const clear=()=>{setSearch('');setBlock('all');setFilter('all');setCompletionAreaId(null);setCompletionItemId(null);setCompletionMessageId(null);setCompletionReportId(null);};
  const nav=(v: string,initialFilter='all')=>{setAttentionOpen(false);setMessageSelection(null);setMessageReturnAreaId(null);setView(v);setManageProjects(false);setVOSelection(null);setVOReturnAreaId(null);setClaimSelection(null);setClaimPreviewFromStatus(false);setClaimVOSelection(null);setClaimRevisionSelection(null);setClaimEditSelection(null);setAttentionReturn(false);setContractReturnVOId(null);setContractReturnAreaId(null);location.hash=`${v}${initialFilter==='vo'?'?filter=vo':''}`;clear();setFilter(initialFilter);setPage(1);setDrawer(null);setMobile(false);};
  function openDrawingArea(areaId: string | null | undefined){nav('drawing');if(areaId)location.hash=`drawing?area=${encodeURIComponent(areaId)}`;window.scrollTo({top:0});}
  function openProgressForArea(areaId: string){
    if(areaId&&!getDrawingMapping(project).areas.some(area=>area.id===areaId))return notify('Choose an area from this project.',true);
    nav('completion');if(areaId){setCompletionAreaId(areaId);location.hash=`completion?area=${encodeURIComponent(areaId)}`;}window.scrollTo({top:0});
  }
  function openInboxMessage(messageId: string | undefined,areaId: string | null = null){
    if(!messageId||!getWhatsAppMessages(project).some(message=>message.id===messageId))return notify('This message is not available in the selected project.',true);
    nav('whatsapp');setMessageSelection(messageId);
    const params=new URLSearchParams({message:messageId});
    if(areaId&&getDrawingMapping(project).areas.some(area=>area.id===areaId)){setMessageReturnAreaId(areaId);params.set('area',areaId);}
    location.hash=`whatsapp?${params.toString()}`;
  }
  function openProgressForItem(itemId: string | null | undefined,areaId: string | null = null,messageId: string | null = null){
    if(!itemId||!s.items.some(item=>item.id===itemId))return notify('Choose a work item from this project.',true);
    nav('completion');setCompletionItemId(itemId);
    const params=new URLSearchParams({item:itemId});
    if(areaId&&getDrawingMapping(project).areas.some(area=>area.id===areaId&&area.workItemIds.includes(itemId))){setCompletionAreaId(areaId);params.set('area',areaId);}
    if(messageId&&getWhatsAppMessages(project).some(message=>message.id===messageId)){setCompletionMessageId(messageId);params.set('message',messageId);}
    location.hash=`completion?${params.toString()}`;
  }
  function selectInboxMessage(messageId: string){
    if(!getWhatsAppMessages(project).some(message=>message.id===messageId))return;
    setMessageSelection(messageId);
    const params=new URLSearchParams({message:messageId});if(attentionReturn)params.set('from','overview');if(messageReturnAreaId&&getDrawingMapping(project).areas.some(area=>area.id===messageReturnAreaId))params.set('area',messageReturnAreaId);
    window.history.replaceState(null,'',`#whatsapp?${params.toString()}`);
  }
  function clearInboxMessageSelection(){
    setMessageSelection(null);
    const params=new URLSearchParams();
    if(attentionReturn)params.set('from','overview');
    if(messageReturnAreaId&&getDrawingMapping(project).areas.some(area=>area.id===messageReturnAreaId))params.set('area',messageReturnAreaId);
    window.history.replaceState(null,'',`#whatsapp${params.size?'?'+params.toString():''}`);
  }
  function openContractWorkItem(itemId: string | undefined,returnVOId: string | null = null,returnAreaId: string | null = null){
    const item=s.items.find(entry=>entry.id===itemId);
    if(!item)return notify('Choose a work item from this project.',true);
    nav('contract');select(item.id);setTab('review');
    const params=new URLSearchParams({item:item.id});
    if(returnVOId&&getVOCases(project).some(entry=>entry.id===returnVOId)){setContractReturnVOId(returnVOId);params.set('vo',returnVOId);}
    if(returnAreaId&&getDrawingMapping(project).areas.some(area=>area.id===returnAreaId&&area.workItemIds.includes(item.id))){setContractReturnAreaId(returnAreaId);params.set('area',returnAreaId);}
    location.hash=`contract?${params.toString()}`;
  }
  function openContractForVO(itemId: string | null,caseId: string){
    if(!getVOCases(project).some(entry=>entry.id===caseId))return notify('Choose extra work from this project.',true);
    if(itemId)return openContractWorkItem(itemId,caseId);
    nav('contract');setTab('items');setContractReturnVOId(caseId);location.hash=`contract?vo=${encodeURIComponent(caseId)}`;
  }
  function openWorkItemMessage(itemId: string){
    const message=getWorkItemSiteMessage(project,itemId);
    if(!message)return notify('No site message is linked to this work item yet.',true);
    openInboxMessage(message.id);
  }
  function openAreaEvidence(entry: { id: string },areaId: string){
    const source=resolveAreaEvidenceSource(project,areaId,entry.id);
    if(!source)return notify('This update is no longer available for this area.',true);
    if(source.kind==='message'){
      nav('whatsapp');setMessageSelection(source.messageId!);setMessageReturnAreaId(areaId);
      location.hash=`whatsapp?${new URLSearchParams({message:source.messageId!,area:areaId}).toString()}`;window.scrollTo({top:0});return;
    }
    const report=s.reports.find(report=>source.kind==='report'&&report.id===source.reportId&&(!report.projectId||report.projectId===project.id)&&(!report.projectCode||report.projectCode===project.code));
    if(report){if(report.vo)return openVO(report.id,areaId);setDrawer({itemId:report.itemId,reportId:report.id});return;}
    notify('The original inbox is unavailable. The saved message remains visible on the drawing.',true);
  }
  function startDrawingProgressDemo(){
    const result=createDrawingProgressDemo(workspace);
    if(result.outcome==='invalid')return notify(result.error||'The demo could not be created.',true);
    setWorkspace(result.workspace);select('');setTab('items');setModal(null);nav('drawing');window.scrollTo({top:0});
    notify('Separate completion demo opened. Select an area, then View in Progress to review its work.');
  }
  function startAreaSplitDemo(){
    const result=createAreaSplitDemo(workspace);
    if(result.outcome==='invalid')return notify(result.error,true);
    setWorkspace(result.workspace);select('');setTab('items');setModal(null);nav('drawing');window.scrollTo({top:0});
    notify('Separate area split demo opened. West 720 m² and East 480 m² share one 1,200 m² contract item.');
  }
  function startAreaAliasDemo(){
    const result=createAreaAliasDemo(workspace);
    if(result.outcome==='invalid')return notify(result.error,true);
    setWorkspace(result.workspace);select('');setTab('items');setModal(null);nav('drawing');window.scrollTo({top:0});
    notify('Separate area name demo opened. West façade has one match; Wall frontage needs clarification.');
  }
  function startMessageMatchDemo(){
    const result=createMessageMatchDemo(workspace);
    if(result.outcome==='invalid')return notify(result.error,true);
    setWorkspace(result.workspace);select('');setTab('items');setModal(null);nav('whatsapp');window.scrollTo({top:0});
    notify('Separate match review demo opened. Check one correct suggestion, correct a mistaken match, and clarify an unclear area.');
  }
  function openProjectManager(){nav('projects');setManageProjects(true);location.hash='projects?manage=1';}
  function openAttentionTask(task: AttentionTask){
    setAttentionOpen(false);
    const current=getProjectAttention(project).find(entry=>entry.id===task?.id&&entry.projectId===project.id);
    if(!current)return notify('This task is no longer waiting for action in the selected project.',true);
    const target=current.target;
    if(target.route==='whatsapp')openInboxMessage(target.messageId);
    else if(target.route==='completion'){
      openProgressForItem(target.itemId);setCompletionReportId(target.reportId||null);
      location.hash=`completion?${new URLSearchParams({item:target.itemId!,report:target.reportId!}).toString()}`;
    }else if(target.route==='vo')openVO(target.caseId);
    else if(target.route==='claim-status')openClaimStatus(target.draftId);
    else if(target.route==='claims'&&target.revisionSourceId)openClaimRevision(target.revisionSourceId);
    else if(target.route==='claims'&&target.draftId){nav('claims');setClaimEditSelection(target.draftId);location.hash=`claims?draft=${encodeURIComponent(target.draftId)}`;}
    else return;
    setAttentionReturn(true);
    const [module,query]=location.hash.slice(1).split('?');const params=new URLSearchParams(query);params.set('from','overview');
    location.hash=`${module}?${params.toString()}`;
  }
  function openOverviewActivity(activity: ReturnType<typeof getProjectOverview>['activities'][number]){
    const current=getProjectOverview(project).activities.find(entry=>entry.id===activity?.id);
    if(!current)return notify('This activity is no longer available in the selected project.',true);
    setAttentionOpen(false);
    const target=current.target;
    if(target.route==='whatsapp')openInboxMessage(target.messageId);
    else if(target.route==='completion'){
      openProgressForItem(target.itemId);setCompletionReportId(target.reportId||null);
      location.hash=`completion?${new URLSearchParams({item:target.itemId!,report:target.reportId!}).toString()}`;
    }else if(target.route==='vo')openVO(target.caseId);
    else if(target.route==='contract')openContractWorkItem(target.itemId);
    else if(target.route==='claim-preview'){nav('claim-preview');openClaimPack(target.draftId);}
    else if(target.route==='claim-status')openClaimStatus(target.draftId);
    else return;
    setAttentionReturn(true);
    const [module,query]=location.hash.slice(1).split('?');const params=new URLSearchParams(query);params.set('from','overview');
    location.hash=`${module}?${params.toString()}`;
    window.scrollTo({top:0});
  }
  function closeReport(){
    setDrawer(null);
    if(attentionReturn)return nav('projects');
    if(completionReportId){setCompletionReportId(null);const params=new URLSearchParams(location.hash.split('?')[1]);params.delete('report');window.history.replaceState(null,'',`#completion${params.size?'?'+params.toString():''}`);}
  }
  function openProgressReview(item: WorkItem,report: SiteReport | null | undefined){
    if(!s.items.some(entry=>entry.id===item?.id))return;
    if(report){
      if(!s.reports.some(entry=>entry.id===report.id&&entry.itemId===item.id&&!entry.vo&&(!entry.projectId||entry.projectId===project.id)&&(!entry.projectCode||entry.projectCode===project.code)))return;
    }
    setCompletionReportId(report?.id||null);
    const params=new URLSearchParams(location.hash.split('?')[1]);
    if(report)params.set('report',report.id);else params.delete('report');
    window.history.replaceState(null,'',`#completion${params.size?'?'+params.toString():''}`);
    setDrawer({itemId:item.id,reportId:report?.id});
  }
  function followNext(next: { route: string; revisionSourceId?: string; draftId?: string; caseId?: string; messageId?: string }){if(next.route==='claims'&&next.revisionSourceId)return openClaimRevision(next.revisionSourceId);if(next.route==='claim-status')return openClaimStatus(next.draftId);if(next.route==='claim-preview')return openClaimPack(next.draftId);if(next.route==='vo')return openVO(next.caseId);if(next.route==='whatsapp'&&next.messageId)return openInboxMessage(next.messageId);nav(next.route);}
  function openVO(caseId: string | null = null,areaId: string | null = null,fromOverview=false){
    setAttentionOpen(false);setAttentionReturn(fromOverview);setVOSelection(caseId);setVOReturnAreaId(areaId);setView('vo');
    const params=new URLSearchParams();if(caseId)params.set('case',caseId);if(areaId&&getDrawingMapping(project).areas.some(area=>area.id===areaId))params.set('area',areaId);if(fromOverview)params.set('from','overview');
    location.hash=`vo${params.size?'?'+params.toString():''}`;clear();setPage(1);setDrawer(null);setModal(null);setMobile(false);
  }
  function openAreaVO(caseId: string,areaId: string){
    if(!getAreaVOFlags(project,areaId)?.cases.some(entry=>entry.id===caseId))return notify('This extra-work case is not available for this area.',true);
    openVO(caseId,areaId);window.scrollTo({top:0});
  }
  function returnToVO(caseId: string){
    const entry=getVOCases(project).find(entry=>entry.id===caseId);
    if(!entry)return notify('This extra work is not available in the selected project.',true);
    openVO(entry.id,getAreaLinkStatus(project,entry.report)?.area?.id);
  }
  function openClaimDrafts(){nav('claims');location.hash='claims?tab=drafts';}
  function openClaimForVO(caseId: string){
    if(!getVOCases(project).some(entry=>entry.id===caseId&&entry.status==='approved'))return notify('Choose an approved VO from this project.',true);
    nav('claims');setClaimVOSelection(caseId);location.hash=`claims?vo=${encodeURIComponent(caseId)}`;
  }
  function openClaimRevision(sourceId: string){nav('claims');setClaimRevisionSelection(sourceId);location.hash=`claims?revise=${encodeURIComponent(sourceId)}`;}
  function openRevisedClaim(draftId: string){const draft=project.claimDrafts.find(entry=>entry.id===draftId&&entry.projectId===project.id);if(draft?.status==='prepared')return openClaimStatus(draft.id);if(draft?.revisionOf)return openClaimRevision(draft.revisionOf);notify('This claim is not available in the selected project.',true);}
  function openClaimStatus(draftId: string | null | undefined){if(!draftId)return notify('Choose a saved claim from the selected project.',true);nav('claim-status');setClaimSelection(draftId);location.hash=`claim-status?draft=${encodeURIComponent(draftId)}`;}
  function openClaimPack(draftId: string | undefined,from: string | null = null){if(!draftId)return notify('Choose a saved claim from the selected project.',true);setClaimSelection(draftId);setClaimPreviewFromStatus(from==='status');setView('claim-preview');location.hash=`claim-preview?draft=${encodeURIComponent(draftId)}${from==='status'?'&from=status':''}`;clear();setDrawer(null);setModal(null);setMobile(false);window.scrollTo({top:0});}
  function downloadClaimPack(pack: ClaimPack){
    if(pack.projectId!==project.id)return notify('Open a claim revision from the selected project.',true);
    const url=URL.createObjectURL(new Blob(['\uFEFF'+toClaimCSV(pack)],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;link.download=claimPackFilename(pack);link.click();URL.revokeObjectURL(url);
    notify('Claim CSV downloaded from the saved revision.');
  }
  function switchProject(id: string,nextView?: string){
    const next=workspace.projects.find(p=>p.id===id);if(!next)return;
    if(id===project.id){if(nextView)nav(nextView);return;}
    setAttentionOpen(false);setWorkspace(old=>({...old,activeProjectId:id}));
    setMessageSelection(null);setMessageReturnAreaId(null);if(view==='whatsapp')window.history.replaceState(null,'','#whatsapp');
    setVOSelection(null);setVOReturnAreaId(null);if(view==='vo')window.history.replaceState(null,'','#vo');
    setClaimVOSelection(null);setClaimRevisionSelection(null);setClaimEditSelection(null);setAttentionReturn(false);setContractReturnVOId(null);setContractReturnAreaId(null);if(view==='contract')window.history.replaceState(null,'','#contract');if(view==='claims')window.history.replaceState(null,'','#claims');setClaimSelection(null);setClaimPreviewFromStatus(false);if(view==='claim-preview')window.history.replaceState(null,'','#claim-preview');if(view==='claim-status'||view==='claim-preview'&&claimPreviewFromStatus){setView('claims');window.history.replaceState(null,'','#claims');}
    if(view==='completion')window.history.replaceState(null,'','#completion');if(view==='drawing')window.history.replaceState(null,'','#drawing');
    select(next.items[0]?.id||'');setTab('items');setModal(null);setToast(null);setDrawer(null);clear();setPage(1);setMobile(false);
    if(nextView)nav(nextView);
  }
  function openClaimExamples(){
    const existing=workspace.projects.find(entry=>entry.claimExamplesDemo===true);
    if(existing)return switchProject(existing.id,'claims');
    const used=new Set(workspace.projects.flatMap(entry=>[entry.id,entry.code].map(value=>String(value).toUpperCase())));
    let index=1;while(used.has(`CLAIM-EXAMPLES${String(index).padStart(2,'0')}`))index+=1;
    const next=createClaimExamplesDemo({name:'Claim examples (Demo)',code:`CLAIM-EXAMPLES${String(index).padStart(2,'0')}`,country:'Singapore'});
    setWorkspace(old=>({...old,activeProjectId:next.id,projects:[...old.projects,next]}));
    nav('claims');select('');setTab('items');setModal(null);window.scrollTo({top:0});
    notify('Claim examples opened in a separate mock project. Your other projects are unchanged.');
  }
  function addProject(values: ProjectValues & { code: string; template?: string }){
    if(workspace.projects.some(p=>[p.id,p.code].some(code=>code.toUpperCase()===values.code.toUpperCase())))return notify('Use a unique project code.',true);
    const next=values.template==='sit-original'?createSITContractDemo(values):values.template==='provided'?createProvidedContractDemo(values):values.template==='warehouse'?createDemoProject(values):createProject(values);
    setWorkspace(old=>({...old,activeProjectId:next.id,projects:[...old.projects,next]}));
    select('');setTab('items');setModal(null);nav(['provided','sit-original'].includes(values.template||'')?'projects':'contract');window.scrollTo({top:0});notify(values.template==='sit-original'?`${next.name} created from the supplied S.I.T. schedule. Site activity and the example claim are simulated.`:values.template==='provided'?`${next.name} created. The fictional contract scenario is ready, with mock progress, VO reviews and an example claim.`:values.template==='warehouse'?`${next.name} created with mock contract items and site messages. Start by checking the highlighted quantity.`:`${next.name} created. Its contract register starts empty.`);
  }
  function importContract(input: Parameters<typeof applyMockContract>[2] & { file?: File }){
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
    notify(input.recovery?(result.createdNew?'Recovered demo entries opened in a new project. Review the flagged values against the demo PDF.':'Recovered demo entries added. Review the flagged values against the demo PDF.'):result.createdNew?'Demo extraction opened in a new project. Check the highlighted quantity against the demo PDF.':'Demo work list added. Check the highlighted quantity against the demo PDF.');
    return result;
  }
  function rememberDrawingPreview(file: File | null | undefined,drawingId = ''){
    const previous=drawingPreviewUrls.current.get(project.id);if(previous)URL.revokeObjectURL(previous);
    if(file){const url=URL.createObjectURL(file);drawingPreviewUrls.current.set(project.id,url);setDrawingPreviews(old=>({...old,[project.id]:{drawingId,url}}));}
    else{drawingPreviewUrls.current.delete(project.id);setDrawingPreviews(old=>{const next={...old};delete next[project.id];return next;});}
  }
  function addDrawing(input: DrawingInput){
    const result=installDrawing(project,input);
    if(result.outcome==='invalid')return result;
    rememberDrawingPreview(input.file,result.project.drawingMapping!.drawing!.id);
    set(()=>result.project);notify('Drawing added. Choose an area and link its contract work items.');return result;
  }
  function saveMappedArea(values: unknown){
    const result=saveAreaMapping(project,values);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='updated')set(()=>result.project);
    notify(result.outcome==='unchanged'?'This area is already saved.':'Area links saved. Split quantities use new area reports; saved claims are unchanged.');return result;
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
    nav('whatsapp');setMessageSelection(result.firstMessageId);location.hash=`whatsapp?message=${encodeURIComponent(result.firstMessageId!)}`;
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
  function removeArea(areaId: string){
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
  const contractChecks=getContractChecks(project);
  const contractTotalReview=getContractTotalReview(project);
  const totalReviewRequired=contractTotalReview.required&&(contractTotalReview.status!=='reviewed'||totalReviewEditing);
  const contractCheckItems=contractChecks.itemIssueCount;
  const contractCheckItemIds=new Set(contractChecks.issues.map(issue=>issue.itemId).filter((id): id is string=>typeof id==='string'));
  const firstContractCheckItem=()=>s.items.find(item=>item.id===contractChecks.issues[0]?.itemId);
  const checkedMoney=(value: string | number | null | undefined)=>value==null?'Unknown':`${contract.currency||'Currency not recorded'} ${money(value)}`;
  const voCases=getVOCases(project);
  const openVOCs=voCases.filter(entry=>!['approved','rejected'].includes(entry.status)||entry.status==='approved'&&entry.claimEligibility!=='excluded'&&!getVOClaimEligibility(entry).eligible);
  function addManualVO(values: unknown){
    const result=createManualVO(project,values);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='updated')set(()=>result.project);
    notify(result.outcome==='unchanged'?'This extra-work entry is already saved.':'Extra work added for QS review. Price is unknown until assessed.');
    return result;
  }
  function reviewVO(caseId: string,action: string,values: unknown){
    const result=updateVOReview(project,caseId,action,values);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='unchanged'){notify('This review is already up to date.');return result;}
    set(old=>updateVOReview(old,caseId,action,values).project);
    const messages: Record<string, string>={assessEligibility:'VO claim checks saved. Existing claim versions are unchanged.',save:'QS assessment saved.',clarify:'Marked as needing information. No message was sent.',submit:'Marked awaiting approval. Nothing was sent externally.',approve:'Demo approval recorded. Contract and completion values are unchanged.',reject:'VO rejected. Evidence and decision history are retained.',reopen:'VO review reopened. The previous decision is retained in history.'};
    notify(messages[action]);return result;
  }
  function validQueryRevision(draft: ClaimDraft | null | undefined){const context=draft?.revisionOf&&getClaimRevisionContext(project,draft.revisionOf);return !!context&&context.revision?.id===draft.id&&context.query.id===draft.queryId;}
  function saveClaim(period: string,assessment: unknown){
    if(getClaimPeriodLock(project,period))return {project,outcome:'invalid' as const,error:'This month already has an issued claim. Open its status for follow-up or choose another month.'};
    const result=saveClaimDraft(project,period,assessment);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='unchanged'){notify('This assessment is already saved.');return result;}
    set(()=>result.project);
    notify('Monthly claim draft saved in this browser.');return result;
  }
  function saveRevision(sourceId: string | null | undefined,assessment: unknown,response: unknown){
    const result=saveClaimRevision(project,sourceId||'',assessment,response);
    if(result.outcome==='updated'){set(()=>result.project);notify('Revision saved. The original claim is preserved.');}
    return result;
  }
  function prepareClaim(draftId: string){
    const draft=project.claimDrafts.find(entry=>entry.id===draftId);
    if(draft&&getClaimPeriodLock(project,draft.period)&&!validQueryRevision(draft))return {project,outcome:'invalid' as const,error:'This month already has an issued claim. Open its status or use its recorded query to revise it.'};
    if(draft?.revisionOf&&(readFormBuffer(project.id,`claims:revision:${draft.revisionOf}:dirty`) as Record<string, boolean> | undefined)?.[draft.period])return {project,outcome:'invalid' as const,error:'Save your revision edits before marking this claim prepared.'};
    const result=markClaimPrepared(project,draftId);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='unchanged'){notify('This draft is already prepared.');return result;}
    set(()=>result.project);
    notify('Claim marked prepared locally. Nothing was submitted.');return result;
  }
  function trackClaim(draftId: string | null,action: string,fields: unknown){
    const draft=project.claimDrafts.find(entry=>entry.id===draftId);const issued=draft&&getClaimPeriodLock(project,draft.period);
    if(action==='submitted'&&issued&&issued.draft.id!==draftId&&!validQueryRevision(draft))return {project,outcome:'invalid' as const,error:'A claim was already issued for this month. Use its query revision flow or choose another month.'};
    const result=recordClaimStage(project,draftId||'',action,fields);
    if(result.outcome==='invalid')return result;
    if(result.outcome==='updated')set(()=>result.project);
    return result;
  }
  function reviewReport(report: SiteReport | null){if(report?.vo)return openVO(report.id);if(report)setDrawer({itemId:report.itemId,reportId:report.id});}
  const whatsappMessages=getWhatsAppMessages(project);
  const workflowCounts=getProjectWorkflow(project).counts;
  const siteAttentionCount=workflowCounts.pendingReports+workflowCounts.newMessages+workflowCounts.clarifications;
  function processMessage(message: WhatsAppMessage){
    const result=processWhatsAppMessage(project,message.id);
    if(result.outcome==='invalid'){notify(result.error||'This message cannot be processed for the selected project.',true);return result;}
    if(result.outcome==='duplicate'){notify('Already processed. No duplicate report or progress was added.');return result;}
    set(old=>processWhatsAppMessage(old,message.id).project);
    const scopedReport=result.project.reports.find(report=>report.id===result.reportId);
    notify(result.outcome==='clarification'?'Marked for clarification. No completion was changed and no message was sent.':message.kind==='vo'?'Possible VO added for QS review with its original message and photo.':scopedReport?.areaProgress?`${scopedReport.areaMapping?.code || scopedReport.area} reported at ${scopedReport.completion}% of its allocated quantity. Whole item: ${num(getItemAreaRollup(result.project,scopedReport.itemId||'','reported').completion)}%. Verification is still required.`:`${scopedReport?.itemId || message.itemId} reported at ${scopedReport?.completion ?? message.completion}% total. Verified progress awaits review.`);
    return result;
  }
  function confirmMessageMatch(messageId: string,fields: {itemId:string;areaId:string;reason:string}){
    const result=saveMessageMatchReview(project,messageId,fields);
    if(result.outcome==='updated'){set(()=>result.project);notify('Match confirmed. Add the progress update separately; verification is still required.');}
    return result;
  }
  function saveClarificationRequest(messageId: string,fields: unknown){
    const result=saveMessageClarificationRequest(project,messageId,fields);
    if(result.outcome==='updated'){set(()=>result.project);notify('Clarification request saved locally. No message was sent.');}
    return result;
  }
  function saveClarificationReply(messageId: string,fields: unknown){
    const result=saveMockClarificationReply(project,messageId,fields);
    if(result.outcome==='updated'){set(()=>result.project);notify('Mock reply saved. Review it before adding reported progress.');}
    return result;
  }
  const progressReview=(item: WorkItem | null | undefined)=>getItemProgressReview(project,item,completionAreaId&&item&&getItemAreaAllocation(project,item.id).split?completionAreaId:undefined);
  const latest=(id: string)=>progressReview(s.items.find(item=>item.id===id)).report;
  const selected=s.items.find(i=>i.id===selectedId)||(!routeContractItem()?s.items[0]:null);
  const completionArea=completionAreaId?getDrawingMapping(project).areas.find(area=>area.id===completionAreaId):null;
  const completionItem=completionItemId?s.items.find(item=>item.id===completionItemId):null;
  const completionMessage=completionMessageId?getWhatsAppMessages(project).find(message=>message.id===completionMessageId):null;
  const contractReturnVO=contractReturnVOId?getVOCases(project).find(entry=>entry.id===contractReturnVOId):null;
  const contractReturnArea=contractReturnAreaId?getDrawingMapping(project).areas.find(area=>area.id===contractReturnAreaId):null;
  const completionItems=view==='completion'?s.items.filter(item=>(!completionAreaId||completionArea?.workItemIds.includes(item.id))&&(!completionItemId||item.id===completionItem?.id)):s.items;
  const filtered=completionItems.filter(i=>(!search||`${i.id} ${i.ref} ${i.description} ${i.location} ${i.demoArea||''} ${getAreasForItem(project,i.id).map(area=>`${area.code} ${area.name}`).join(' ')}`.toLowerCase().includes(search.toLowerCase()))&&(block==='all'||i.location.includes(block))).filter(i=>filter==='all'||(view==='contract'?(filter==='review'?contractCheckItemIds.has(i.id):!contractCheckItemIds.has(i.id)):progressReview(i).key===filter));
  const nextProgressReview=view==='completion'&&filter!=='vo'?filtered.map(item=>({item,review:progressReview(item)})).find(entry=>entry.review.key==='review'):null;
  const total=Math.max(1,Math.ceil(filtered.length/SIZE));const current=Math.min(page,total);const rows=filtered.slice((current-1)*SIZE,current*SIZE);
  const openItem=(item: WorkItem | null | undefined)=>{if(!item)return;select(item.id);setTab('review');const params=new URLSearchParams(location.hash.split('?')[1]);if(!contractReturnVO)params.delete('vo');if(!contractReturnArea)params.delete('area');params.set('item',item.id);window.history.replaceState(null,'',`#contract?${params.toString()}`);window.scrollTo({top:0,left:0,behavior:'instant'});};
  function showContractItems(){setTab('items');const params=new URLSearchParams(location.hash.split('?')[1]);params.delete('item');if(!contractReturnVO){params.delete('vo');setContractReturnVOId(null);}if(!contractReturnArea){params.delete('area');setContractReturnAreaId(null);}window.history.replaceState(null,'',`#contract${params.size?'?'+params.toString():''}`);}
  function requestContractConfirmation(){
    if(contractCheckItems)return openItem(firstContractCheckItem());
    if(totalReviewRequired){const unfinished=findUnfinishedContractItem(project);if(unfinished){openItem(s.items.find(item=>item.id===unfinished));return notify('Save or revert your unfinished contract edits before reviewing the total.',true);}showContractItems();setContractChecksOpen(true);setTotalReviewRequest(value=>({projectId:project.id,version:project.version,tick:value.tick+1}));return;}
    setModal('lock');
  }
  function saveTotalDifference(reason: string,scopeKey: string | null){
    if(scopeKey!==getContractTotalReview(project).scopeKey)return {project,outcome:'invalid' as const,error:'The contract values changed. Review the current totals before saving a reason.'};
    if(findUnfinishedContractItem(project))return {project,outcome:'invalid' as const,error:'Save or revert unfinished contract item edits before reviewing the total.'};
    const result=saveContractTotalReview(project,reason);
    if(result.outcome==='updated')set(()=>result.project);
    if(['updated','unchanged'].includes(result.outcome))notify('Total difference reason saved for this contract version. Confirm the work list when ready.');
    return result;
  }
  function saveItem(values: ContractItemValues){
    if(!selected)return notify('Choose a contract work item.',true);
    if(s.locked)return notify('Create a revision before editing this baseline.',true);
    const q=values.quantity===''?null:Number(values.quantity),r=values.rate===''?null:Number(values.rate);
    if(!values.description.trim()||!values.unit||q===null||!Number.isFinite(q)||q<0||(selected.pricingType!=='included'&&(r===null||!Number.isFinite(r)||r<0)))return notify('Enter a description, unit and non-negative quantity and rate.',true);
    const amount=selected.pricingType==='measured'?claimBasisProduct(q,r):null;
    if(selected.pricingType==='measured'&&amount===null)return notify('Enter a valid quantity and rate with up to four decimal places.',true);
    const source=project.sourceItems.find(i=>i.id===selected.id);
    if(selected.needsReview&&source?.amount!=null&&Math.abs(Number(source.amount)-Number(amount))>.011)return notify('The quantity and rate still do not reconcile with the source amount.',true);
    set(old=>({...old,items:old.items.map(i=>i.id===selected.id?{...i,...values,quantity:q,rate:selected.pricingType==='included'?null:r,amount,needsReview:false,rawExtractedQuantity:undefined,reviewedAt:new Date().toISOString()}:i),history:[audit('Contract item confirmed',`${selected.id} · ${num(q)} ${values.unit} · baseline v${old.version}`),...old.history]}));clearFormBuffer(project.id,contractFormScope(selected,s.version,s.locked));showContractItems();notify(`${selected.id} checked and saved. Confirm the work list when all items are checked.`);
  }
  function lock(){const unfinished=findUnfinishedContractItem(project);if(unfinished){setModal(null);openItem(s.items.find(item=>item.id===unfinished));return notify('Save or revert your unfinished contract edits before confirming the work list.',true);}if(!s.items.length)return notify('Add contract items before confirming a baseline.',true);if(!contractChecks.canConfirm){setModal(null);setContractChecksOpen(true);const item=firstContractCheckItem();if(item)openItem(item);return notify('Resolve the contract item checks before confirming the work list.',true);}if(totalReviewRequired){setModal(null);requestContractConfirmation();return notify('Record a reason for the total difference before confirming this work list.',true);}const result=confirmContractBaseline(project);if(result.outcome==='invalid')return notify(result.error,true);if(result.outcome==='updated')set(()=>result.project);setModal(null);notify('Work list confirmed. Continue to site updates to review the worker messages.');}
  function createRevision(reason: string){
    const result=createContractRevision(project,reason);
    if(result.outcome==='updated'){set(()=>result.project);setModal(null);notify(`Version ${result.project.version} is ready to edit. Confirm the work list after reviewing changes.`);}
    return result;
  }
  function approve(report: SiteReport,percentage: string,reason: string){
    const result=verifyProgressReport(project,report.id,percentage,reason);
    if(result.outcome==='invalid')return notify(result.error||'Review the area report before verification.',true);
    if(result.outcome==='updated')set(()=>result.project);
    setDrawer(null);setCompletionReportId(null);notify(result.note||'Progress verified. Claim assessment stays separate.');
  }
  function changeReport(report: SiteReport,action: string,reason: string){
    if(report.vo)return openVO(report.id);
    if(action==='clarify'){
      const result=requestProgressClarification(project,report.id,reason);
      if(result.outcome==='invalid')return notify(result.error,true);
      if(result.outcome==='updated')set(old=>requestProgressClarification(old,report.id,reason).project);
      setDrawer(null);setCompletionReportId(null);return notify('Marked as needing clarification. Contact the worker outside this demo, then add a clearer total-progress update. No message was sent.');
    }
    set(old=>syncAreaItemProgress({...old,reports:old.reports.map(r=>r.id===report.id?{...r,status:action==='reject'?'rejected':'needsReview',reviewReason:reason,...(action==='vo'?{vo:true}:{})}:r),history:[audit(action==='vo'?'Possible VO flagged':'Report dismissed',`${report.id}${reason?` · ${reason}`:''}`),...old.history]},report.itemId||''));setDrawer(null);setCompletionReportId(null);notify(action==='vo'?'Possible VO flagged for QS review. No price or claim was approved.':'Report dismissed. Verified progress is unchanged.');if(action==='vo')openVO(report.id);
  }
  function addReport(v: ReportInput){
    const result=addProgressReport(project,v);
    if(result.outcome==='invalid')return notify(result.error||'Check the work item, area and completion.',true);
    if(result.outcome==='updated')set(()=>result.project);
    setModal(null);setDrawer({itemId:v.itemId,reportId:result.reportId});notify(result.note||'Demo report added. Verified progress is unchanged.');
  }
  function exportCSV(){const text=['Project code,Item,Description,Block,Unit,Quantity,Rate,Amount,Reported %,Verified %,Review',...s.items.map(item=>{const i=getItemAreaAllocation(project,item.id).split?{...item,reported:getItemAreaRollup(project,item.id,'reported').completion,verified:getItemAreaRollup(project,item.id,'verified').completion}:item;return [project.code,i.ref,i.description,i.location,i.unit,i.needsReview?i.rawExtractedQuantity??i.quantity:i.quantity,i.rate??'',i.amount??i.pricingType,i.reported,i.verified,i.needsReview?'Needs review':'Reviewed'].map(v=>`"${String(v).replaceAll('"','""')}"`).join(',');})].join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`${project.code}-demo-${view}.csv`;a.click();URL.revokeObjectURL(url);notify('Demo register exported as CSV.');}

  const contractOptions=<ActionMenu items={[
    {label:'Contract details',icon:FileText,onSelect:()=>setModal('project')},
    {label:'Upload contract',icon:Upload,onSelect:()=>setModal('upload')},
    s.locked&&{label:'Edit contract',icon:Pencil,onSelect:()=>setModal('revision')},
    {label:'Contract versions',icon:History,onSelect:()=>setModal('contract-versions')},
    {label:'Activity',icon:History,onSelect:()=>setModal('history')},
  ]}/>;

  return <div className={`app-shell ${collapsed?'sidebar-collapsed':''} ${mobile?'mobile-open':''}`}>
    <aside id="project-sidebar" className="sidebar" aria-label="Main navigation"><div className="brand"><div className="brand-icon"><Building2 size={23}/></div><div className="brand-copy"><strong>Claim & VO</strong><span>Project workspace</span></div></div>
      <div className="nav-caption">YOUR PROJECT</div>
      <nav><button className={`nav-item ${view==='projects'&&!manageProjects?'active':''}`} aria-current={view==='projects'&&!manageProjects?'page':undefined} title="Project overview" onClick={()=>nav('projects')}><Building2 size={18}/><span>Overview</span></button><button className={`nav-item ${['contract','drawing'].includes(view)?'active':''}`} aria-label="Contract" aria-current={['contract','drawing'].includes(view)?'page':undefined} title="Contract" onClick={()=>nav('contract')}><span className="nav-step" aria-hidden="true">1</span><span>Contract</span>{contractCheckItems>0&&<span className="nav-count">{contractCheckItems}</span>}</button><button className={`nav-item ${['whatsapp','completion'].includes(view)?'active':''}`} aria-label="Site updates" aria-current={['whatsapp','completion'].includes(view)?'page':undefined} title="Site updates" onClick={()=>nav('whatsapp')}><span className="nav-step" aria-hidden="true">2</span><span>Site updates</span>{siteAttentionCount>0&&<span className="nav-count">{siteAttentionCount}</span>}</button><button className={`nav-item ${view==='vo'?'active':''}`} aria-label="Extra work" aria-current={view==='vo'?'page':undefined} title="Extra work" onClick={()=>openVO()}><span className="nav-step" aria-hidden="true">3</span><span>Extra work</span>{openVOCs.length>0&&<span className="nav-count">{openVOCs.length}</span>}</button><button className={`nav-item ${['claims','claim-preview','claim-status'].includes(view)?'active':''}`} aria-label="Monthly claims" aria-current={['claims','claim-preview','claim-status'].includes(view)?'page':undefined} title="Monthly claims" onClick={()=>nav('claims')}><span className="nav-step" aria-hidden="true">4</span><span>Monthly claims</span></button></nav>
      <div className="sidebar-bottom"><button className={`nav-item ${view==='projects'&&manageProjects?'active':''}`} aria-current={view==='projects'&&manageProjects?'page':undefined} title="All projects" onClick={openProjectManager}><Building2 size={17}/><span>All projects</span></button><button className="nav-item" title="Help and demo guide" onClick={()=>setModal('guide')}><Info size={17}/><span>Help & demo guide</span></button><button className="nav-item" title="Reset demo" onClick={()=>setModal('reset')}><RotateCcw size={17}/><span>Reset demo</span></button><div className="sidebar-user"><div className="avatar">AT</div><div><strong>Alex Tan</strong><small>Demo reviewer</small></div><ShieldCheck size={17}/></div></div>
    </aside>{mobile&&<div className="mobile-sidebar-overlay" onClick={()=>setMobile(false)}/>}
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><Button className="ghost icon" aria-label="Toggle sidebar" aria-controls="project-sidebar" aria-expanded={window.innerWidth<=760?mobile:!collapsed} onClick={()=>window.innerWidth<=760?setMobile(!mobile):collapse(!collapsed)}>{collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</Button><span className="topbar-divider"/><ProjectDropdown projects={workspace.projects} activeProjectId={project.id} showcaseProjectId={showcaseProjectId} onSelect={switchProject} onManage={openProjectManager} onCreate={()=>setModal('create')}/></div><div className="topbar-right"><AttentionNotifications project={project} tasks={attentionTasks} open={attentionOpen} onOpenChange={setAttentionOpen} onOpenTask={openAttentionTask}/><button className="demo-mode" onClick={()=>setModal('guide')} title="Demo data saved in this browser"><Info size={12}/>Demo</button><div className="avatar">AT</div></div></header>
    <main className={`page-content${view==='contract'&&tab==='review'?' contract-review-page':''}`}>{storageError&&<div className="notice warning" role="alert">Browser storage is unavailable or full. Edits will not survive a reload.</div>}<WorkflowNav project={project} view={view} onNavigate={nav}/>{['whatsapp','completion'].includes(view)&&<SiteViewTabs view={view} onNavigate={nav} pending={workflowCounts.pendingReports}/>}{view==='projects'?(manageProjects?<ProjectsView projects={workspace.projects} activeProjectId={project.id} showcaseProjectId={showcaseProjectId} onOpen={switchProject} onBack={()=>nav('projects')} onCreate={()=>setModal('create')}/>:<ProjectOverview project={project} onNavigate={nav} onReviewContract={()=>{nav('contract');setTab('review');}} onNext={followNext} onOpenTask={openAttentionTask} onOpenActivity={openOverviewActivity} onOpenAttention={()=>setAttentionOpen(true)} attentionOpen={attentionOpen}/>):view==='drawing'?<DrawingMappingView key={project.id} project={project} initialAreaId={new URLSearchParams(location.hash.split('?')[1]).get('area')} previewUrl={drawingPreviews[project.id]?.drawingId===getDrawingMapping(project).drawing?.id?drawingPreviews[project.id]?.url:null} onBack={()=>{nav('contract');setTab('items');}} onInstall={addDrawing} onSaveArea={saveMappedArea} onAddContractAreas={addSITContractAreas} onAddAreaMessages={addSITDemoMessages} onOpenSiteUpdates={()=>nav('whatsapp')} onRemoveArea={removeArea} onPreviewFile={file=>rememberDrawingPreview(file,getDrawingMapping(project).drawing?.id)} onOpenProgress={openProgressForArea} onOpenContractItem={(itemId,areaId)=>openContractWorkItem(itemId,null,areaId)} onOpenEvidence={openAreaEvidence} onOpenVO={openAreaVO} onStartCompletionDemo={startDrawingProgressDemo} onStartAreaSplitDemo={startAreaSplitDemo} onStartAreaAliasDemo={startAreaAliasDemo} onStartMessageMatchDemo={startMessageMatchDemo}/>:view==='whatsapp'?<WhatsAppView key={project.id} project={project} messages={whatsappMessages} initialMessageId={messageSelection} onBackToOverview={attentionReturn?()=>nav('projects'):undefined} onSelectMessage={selectInboxMessage} onClearMessageSelection={clearInboxMessageSelection} onBackToDrawing={messageReturnAreaId&&getDrawingMapping(project).areas.some(area=>area.id===messageReturnAreaId)?()=>openDrawingArea(messageReturnAreaId):undefined} onProcess={processMessage} onSaveMatch={confirmMessageMatch} onStartMatchDemo={startMessageMatchDemo} onSaveClarificationRequest={saveClarificationRequest} onSaveClarificationReply={saveClarificationReply} onReview={reviewReport} onOpenVO={openVO} onOpenCompletion={openProgressForItem} onOpenContract={()=>{nav('contract');select(needs[0]?.id||s.items[0]?.id||'');setTab('review');}} onOpenDrawing={openDrawingArea} onOpenContractItem={openContractWorkItem} onAddAreaMessages={addSITDemoMessages} onRefreshDemoPhotos={updateSITDemoPhotos}/>:view==='vo'?<VOReviewView key={project.id} project={project} cases={voCases} initialCaseId={voSelection} onBackToOverview={attentionReturn?()=>nav('projects'):undefined} onSelect={caseId=>openVO(caseId,voReturnAreaId,attentionReturn)} onBackToDrawing={voReturnAreaId&&getDrawingMapping(project).areas.some(area=>area.id===voReturnAreaId)?()=>openDrawingArea(voReturnAreaId):undefined} onClearCaseSelection={()=>openVO(null,voReturnAreaId)} onAction={reviewVO} onCreate={addManualVO} onOpenWhatsApp={()=>nav('whatsapp')} onOpenContract={openContractForVO} onReviewContract={()=>{nav('contract');setTab('items');}} onOpenClaims={openClaimForVO}/>:view==='claims'?<MonthlyClaimView key={`${project.id}-${claimRevisionSelection||claimEditSelection||'claims'}`} project={project} initialDraftId={claimEditSelection} onBackToOverview={attentionReturn?()=>nav('projects'):undefined} initialRevisionSourceId={claimRevisionSelection} onBackToQuery={claimRevisionSelection&&getClaimRevisionContext(project,claimRevisionSelection)?()=>openClaimStatus(claimRevisionSelection):undefined} onBackToClaims={openClaimDrafts} onSaveRevision={saveRevision} onRevise={openClaimRevision} onOpenRevision={openRevisedClaim} initialTab={new URLSearchParams(location.hash.split('?')[1]).get('tab')} initialVOId={claimVOSelection} onBackToVO={claimVOSelection&&voCases.some(entry=>entry.id===claimVOSelection)?()=>returnToVO(claimVOSelection):undefined} onTryExamples={openClaimExamples} onSave={saveClaim} onPrepare={prepareClaim} onTrack={openClaimStatus} onOpenCompletion={()=>nav('completion')} onOpenVO={()=>openVO()} onOpenContract={()=>nav('contract')} onPreview={openClaimPack}/>:view==='claim-status'?<ClaimStatusTracker key={`${project.id}-${claimSelection||'none'}`} project={project} draftId={claimSelection} onBack={openClaimDrafts} onBackToOverview={attentionReturn?()=>nav('projects'):undefined} onRecord={trackClaim} onRevise={openClaimRevision} onOpenRevision={openRevisedClaim} onPreview={draftId=>openClaimPack(draftId,'status')}/>:view==='claim-preview'?<ClaimPackPreview key={`${project.id}-${claimSelection||'none'}`} project={project} draftId={claimSelection} onBack={attentionReturn?()=>nav('projects'):claimPreviewFromStatus?()=>openClaimStatus(claimSelection):openClaimDrafts} backLabel={attentionReturn?'Back to overview':claimPreviewFromStatus?'Back to claim status':'Back to claims'} onDownloadCSV={downloadClaimPack} onTrack={openClaimStatus}/> :<><PageHeader title={view==='contract'?(tab==='review'?'Contract review':'Contract'):'Site progress'} description={view==='contract'?(tab==='review'?(s.locked?'Read-only contract. Compare this item with its source schedule.':'Check the source and item values, then confirm the item.'):(s.locked?'Your checked work list. Open an item to compare it with the contract.':'Review each item against the source, then confirm the work list.')):'Compare worker-reported completion with supervisor-verified totals.'} onBack={['contract','completion'].includes(view)&&attentionReturn?()=>nav('projects'):view==='contract'&&contractReturnVO?()=>returnToVO(contractReturnVO.id):view==='contract'&&contractReturnArea?()=>openDrawingArea(contractReturnArea.id):view==='contract'&&tab==='review'?showContractItems:view==='completion'&&completionMessage?()=>openInboxMessage(completionMessage.id,completionArea?.id):view==='completion'&&completionAreaId?()=>openDrawingArea(completionAreaId):undefined} backLabel={['contract','completion'].includes(view)&&attentionReturn?'Back to overview':view==='contract'&&contractReturnVO?'Back to extra work':view==='contract'&&contractReturnArea?'Back to drawing':view==='completion'&&completionMessage?'Back to message':view==='completion'?'Back to drawing':'Back to work items'} actions={view==='contract'?(tab==='review'||!s.items.length?null:<>{s.locked?<Button className="primary" icon={ArrowRight} onClick={()=>nav('whatsapp')}>Continue to site updates</Button>:<Button className="primary" icon={CheckCheck} onClick={requestContractConfirmation}>{contractCheckItems?`Review ${contractCheckItems} item${contractCheckItems===1?'':'s'}`:totalReviewRequired?'Review total difference':'Confirm work list'}</Button>}</>):<>{nextProgressReview&&<Button className="primary" icon={ShieldCheck} onClick={()=>openProgressReview(nextProgressReview.item,nextProgressReview.review.report)}>Review next update</Button>}<Button onClick={()=>openDrawingArea(completionAreaId)}>Drawing status</Button></>}/>
      {view==='contract'&&contract.demoImport&&<details className="contract-import-details"><summary><Badge tone="blue">Demo extraction</Badge><span>6 sample work items · {contract.demoImport.fileName}</span></summary><div><p>{contract.demoImport.inputKind==='upload'?'The selected PDF is preview only. This work list uses the fictional demo contract; the selected PDF was not read.':'The work list is a simulated result from the fictional demo contract.'}</p><div className="contract-import-links"><a className="button" href={DEMO_CONTRACT_PDF} target="_blank" rel="noreferrer">View demo source PDF <ArrowUpRight size={14}/></a>{contract.demoImport.inputKind==='upload'&&(inputPreviews[project.id]?<a className="button" href={inputPreviews[project.id]} target="_blank" rel="noreferrer">Preview selected PDF <ArrowUpRight size={14}/></a>:<span>Selected-file preview ends when the page is refreshed. The demo source stays available.</span>)}</div></div></details>}
      {view==='contract'&&tab!=='review'&&s.items.length>0&&<div className="contract-summary"><div><Badge tone={s.locked?'green':'amber'}>{s.locked?'Contract checked':contractCheckItems?`${contractCheckItems} to check`:'Review work list'}</Badge><span className="contract-summary-value">Declared contract value <strong>{contract.totalAmount==null?'Not added':`${currencySymbol}${money(contract.totalAmount)}`}</strong></span></div><div>{contractOptions}</div></div>}
      {view==='completion'&&completionReportId&&!completionReport&&<div className="notice warning"><CircleAlert size={16}/><span>This site report is not available in the selected project.</span></div>}
      {view==='completion'&&completionItemId&&<div className="notice info"><Info size={16}/><span>{completionItem?<>Showing <strong>Ref. {completionItem.ref} · {completionItem.description}</strong> from the selected site update.</>:<>This work item is not available in the selected project.</>}</span><Button onClick={clear}>Show all work items</Button></div>}
      {view==='completion'&&completionAreaId&&!completionItemId&&<div className="notice info"><Info size={16}/><span>{completionArea?<>Area <strong>{completionArea.code} · {completionArea.name}</strong> — showing {completionItems.length} linked work item{completionItems.length===1?'':'s'}. Totals are for each whole work item.</>:<>This area is no longer available in this project. Choose another area on the drawing or show all work items.</>}</span><Button onClick={clear}>Show all work items</Button></div>}
      {!s.items.length?<div className="empty-state project-empty"><FileText size={32}/><h3>No contract items yet</h3><p>Choose a PDF or use the demo contract, then review a simulated extracted work list.</p><Button className="primary" icon={Upload} onClick={()=>setModal('upload')}>Upload contract</Button><Button onClick={()=>setModal('create')}>Create a mock project</Button></div>:<>
      {view==='contract'&&tab!=='review'&&<ContractChecks key={project.id} project={project} checks={contractChecks} totalReview={contractTotalReview} onSaveTotalReview={saveTotalDifference} onReviewEditingChange={setTotalReviewEditing} reviewRequested={totalReviewRequest.projectId===project.id&&totalReviewRequest.version===project.version?totalReviewRequest.tick:0} open={contractChecksOpen} onOpenChange={setContractChecksOpen} onOpenItem={itemId=>openItem(s.items.find(item=>item.id===itemId))}/>}
      {view==='contract'&&tab!=='review'&&<div className="tab-bar"><button className="tab-button active" onClick={showContractItems}>Work items</button><button className="tab-button" onClick={()=>nav('drawing')}>Drawing &amp; areas</button></div>}
      {view==='contract'&&tab==='review'?<><div className="review-navigation contract-review-navigation"><div className="contract-item-picker"><FormField label="Work item"><SelectField aria-label="Choose contract item" value={selected?.id||''} onChange={event=>openItem(s.items.find(item=>item.id===event.target.value))}>{!selected&&<option value="">Choose an item</option>}{s.items.map(item=><option key={item.id} value={item.id}>{item.ref} — {item.description}{item.needsReview?' · Needs review':''}</option>)}</SelectField></FormField></div><div className="review-item-navigation">{selected&&<><span className="cell-secondary">Item {s.items.indexOf(selected)+1} of {s.items.length}</span><Button className="icon" aria-label="Previous item" disabled={s.items.indexOf(selected)===0} onClick={()=>openItem(s.items[s.items.indexOf(selected)-1])}><ChevronLeft size={15}/></Button><Button className="icon" aria-label="Next item" disabled={s.items.indexOf(selected)===s.items.length-1} onClick={()=>openItem(s.items[s.items.indexOf(selected)+1])}><ChevronRight size={15}/></Button></>}{contractOptions}</div></div>{selected?<ContractComparison project={project} item={selected} checkIssue={contractChecks.issues.find(issue=>issue.itemId===selected.id)} onSave={saveItem} nextLabel={s.items.indexOf(selected)===s.items.length-1?'Back to work items':undefined} onNext={()=>{const index=s.items.indexOf(selected);if(index===s.items.length-1)showContractItems();else openItem(s.items[index+1]);}}/>:<div className="notice warning"><CircleAlert size={16}/><span>This contract item is not available in the selected project.</span><Button onClick={showContractItems}>Show work items</Button></div>}</>:<>
        {view==='completion'?<ProgressFilters project={project} items={completionItems} search={search} block={block} filter={filter} blocks={blocks} onSearch={setSearch} onBlock={setBlock} onFilter={setFilter} onClear={clear} onActivity={()=>setModal('history')} onAdd={()=>{setReportItemId(null);setModal('report');}} onExtraWork={()=>openVO()} extraWorkCount={voCases.length}/>:<ContractFilters items={s.items} reviewItemIds={contractCheckItemIds} resultCount={filtered.length} search={search} block={block} filter={filter} blocks={blocks} onSearch={setSearch} onBlock={setBlock} onFilter={setFilter} onClear={clear} onExport={exportCSV}/>}
        {view==='completion'&&!s.locked&&<div className="notice info"><Info size={16}/><span>Check and confirm the contract work list before verifying progress.</span><button onClick={()=>{nav('contract');setTab('review');}}>Review contract <ArrowRight size={14}/></button></div>}
        <div className="table-shell"><div className="table-scroll">{view==='contract'?<ContractRegister project={project} items={rows} reviewItemIds={contractCheckItemIds} currencySymbol={currencySymbol} onReview={openItem} onOpenMessage={openWorkItemMessage}/>:<ProgressRegister areaId={completionAreaId} project={project} items={rows} onReview={openProgressReview}/>}{rows.length===0&&<Empty clear={clear}/>}</div><Pagination count={filtered.length} page={current} total={total} onChange={setPage}/></div>
        {view==='contract'&&<div className="tips-row"><Info size={14}/><span>{view==='contract'?(sourceProvided?'Representative subset only. Included and rate-only entries are preserved; sample rows do not add up to the full contract sum.':'Illustrative quantities and rates for this demo project.'):'Reported progress needs supervisor verification. Percentages do not automatically create claim values.'}</span></div>}
      </>}
    </>}
    </>}
    {view==='completion'&&s.items.length>0&&<div className="next-module"><div><strong>Next: prepare your monthly claim</strong><p>Use verified progress and extra work cleared for claiming. Review the claim quantities and amounts before saving.</p></div><Button onClick={()=>nav('claims')}>Open monthly claims<ArrowRight size={14}/></Button></div>}
    </main></div>
    {toast&&<div className={`toast ${toast.error?'error':''}`} role="status">{toast.error?<CircleAlert size={17}/>:<CheckCheck size={17}/>}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={15}/></button></div>}
    {drawer&&<ReportDrawer project={project} key={`${project.id}-${drawer.reportId||drawer.itemId}`} projectCode={project.code} item={s.items.find(i=>i.id===drawer.itemId)} report={s.reports.find(r=>r.id===drawer.reportId)} locked={s.locked} onClose={closeReport} onApprove={approve} onChange={changeReport} onReviewVO={r=>openVO(r.id)} onAdd={itemId=>{setReportItemId(itemId||null);setDrawer(null);setCompletionReportId(null);setModal('report');}}/>}
    {modal==='lock'&&<Modal title="Confirm work list" description={`${project.code} · Version ${s.version}`} onClose={()=>setModal(null)} footer={<><Button onClick={()=>setModal(null)}>Cancel</Button><Button className="primary" icon={contractCheckItems?ArrowRight:LockKeyhole} onClick={lock}>{contractCheckItems?'Review unresolved item':'Confirm work list'}</Button></>}><div className={`notice ${contractCheckItems?'warning':'success'}`}><ShieldCheck size={17}/><span>{contractCheckItems?`${contractCheckItems} item${contractCheckItems===1?' needs':'s need'} checking before the baseline can be confirmed.`:`All ${s.items.length} items have passed the saved-value checks.`}</span></div><dl className="contract-confirm-totals"><div><dt>{contractChecks.partial?'Selected work total':'Work-list total'}</dt><dd>{checkedMoney(contractChecks.totals.recordedTotal)}</dd></div><div><dt>Declared contract value</dt><dd>{checkedMoney(contractChecks.totals.declaredTotal)}</dd></div></dl>{contractChecks.partial?<p className="contract-confirm-note"><strong>Partial schedule.</strong> These {s.items.length} selected rows are part of the contract. Their total is not expected to match the full declared value.</p>:contractChecks.totals.comparison==='difference'?<div className="contract-confirm-note"><p>The work-list total differs from the declared contract value by {checkedMoney(contractChecks.totals.difference)}. Values stay as recorded.</p>{contractTotalReview.status==='reviewed'?<p><strong>QS reason:</strong> {contractTotalReview.review!.reason}</p>:<p>Record the QS reason in Contract checks before confirming.</p>}</div>:null}<p>Confirming locks this version for progress review. Later edits require a new baseline revision.</p></Modal>}
    {modal==='revision'&&<ContractRevisionForm key={`${project.id}-${project.version}`} project={project} onClose={()=>setModal(null)} onCreate={createRevision}/>}
    {modal==='contract-versions'&&<ContractVersionHistory key={project.id} project={project} onClose={()=>setModal(null)}/>}
    {modal==='reset'&&<Modal title="Reset this project demo?" onClose={()=>setModal(null)} footer={<><Button onClick={()=>setModal(null)}>Cancel</Button><Button className="danger" icon={RotateCcw} onClick={()=>{clearProjectFormBuffers(project.id);rememberDrawingPreview(null);set(old=>resetProject(old));setModal(null);nav('projects');setDrawer(null);select(project.sourceItems[0]?.id||'');setTab('items');clear();notify(`${project.name} restored. Other projects are unchanged.`);}}>Reset demo</Button></>}><p>Restore only {project.name}’s sample rows, reports and review history, and clear its drawings and area mappings. Other projects and original source files are unaffected.</p></Modal>}
    {modal==='guide'&&<Modal title="From contract to claim" description="Choose a project in the top bar. Every step uses that project." onClose={()=>setModal(null)}><ol className="guide-list"><li><strong>Contract:</strong> check the work items, confirm the list and map site areas under Drawing &amp; areas.</li><li><strong>Site updates:</strong> review worker messages, then verify progress in the Progress tab.</li><li><strong>Extra work:</strong> review additions and record their approval when required.</li><li><strong>Monthly claims:</strong> choose work, enter totals, review and export a saved claim. After preparation, simulate submission, certification and payment in Claim status.</li></ol><div className="notice info"><Info size={16}/><span>This is a local demo. AI, WhatsApp and backend services are not connected. Nothing is submitted or sent externally.</span></div><p style={{marginTop:14,fontSize:12,color:'#64748b'}}>Contract values are {sourceProvided?'from the supplied sample':'illustrative demo values'}. Site reports and approval records are simulated.</p></Modal>}
    {modal==='project'&&<Modal title={project.name} description={`${project.code} · ${project.country}`}  onClose={()=>setModal(null)}><div className="detail-grid">{[['Reference',contract.reference],['Main contractor',contract.mainContractor],['Subcontractor',contract.subcontractor],['Contract date',contract.dateLabel||'Not added'],['Declared sum',contract.totalAmount==null?'Not added':`${currency} ${money(contract.totalAmount)}`],['Sample scope',contract.sampleNote||'Empty register']].map(([label,value])=><div className="detail-block" key={label}><div className="detail-label">{label}</div><div className="detail-value">{value}</div></div>)}</div><div className="notice info"><Info size={16}/><span>{contract.pricingNote||'Contract extraction will be connected later. Each project has separate records in this browser.'}</span></div></Modal>}
    {modal==='history'&&<Modal title="Activity history" description={`${project.code} · Local demo actions`} onClose={()=>setModal(null)}>{s.history.length?<div className="activity-list">{s.history.map(h=><div className="activity-item" key={h.id}><History size={16}/><section><strong>{h.action}</strong><p>{h.detail}</p><small>{time(h.date)} · {h.actor}</small></section></div>)}</div>:<div className="empty-state"><History size={25}/><h3>No activity yet</h3><p>Contract checks and progress decisions appear here.</p></div>}</Modal>}

    {modal==='create'&&<CreateProjectModal projects={workspace.projects} providedContract={getProvidedContractSample()} originalContract={getSITContractSample()} onClose={()=>setModal(null)} onCreate={addProject}/>}
    {modal==='report'&&s.items.length>0&&<AddReport key={project.id} project={project} items={s.items} initialItemId={reportItemId} onClose={()=>setModal(null)} onSave={addReport} notify={notify}/>}
    {modal==='upload'&&<ContractUploadFlow key={project.id} project={project} onClose={()=>setModal(null)} onApply={importContract}/>}
  </div>;
}

function AddReport({project,items,initialItemId,onClose,onSave,notify}: { project: Project; items: WorkItem[]; initialItemId?: string | null; onClose: () => void; onSave: (values: ReportInput) => void; notify: (message: string, error?: boolean) => void }){
  const first=items.find(item=>item.id===initialItemId)||items[0];
  const reportArea=(item: WorkItem)=>{const allocated=getItemAreaAllocation(project,item.id).areas[0];return allocated?`Area ${allocated.code}`:getAreasForItem(project,item.id)[0]?.code?`Area ${getAreasForItem(project,item.id)[0].code}`:item.demoArea||item.location;};
  const [id,setId]=useState(first.id),[pct,setPct]=useState('75'),[area,setArea]=useState(reportArea(first)),[message,setMessage]=useState(`${project.code} | ${first.location} | ${reportArea(first)} | ${first.id} | COMPLETE=75% TOTAL`),[photo,setPhoto]=useState<string | null>(null);
  const allocation=getItemAreaAllocation(project,id);
  const choose=(v: string)=>{setId(v);const i=items.find(x=>x.id===v)!;setArea(reportArea(i));setMessage(`${project.code} | ${i.location} | ${reportArea(i)} | ${v} | COMPLETE=${pct}% TOTAL`);};
  function attach(e: ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>2500000)return notify('Choose a JPEG, PNG or WebP smaller than 2.5 MB for this local demo.',true);const r=new FileReader();r.onload=()=>setPhoto(typeof r.result==='string'?r.result:null);r.readAsDataURL(f);}
  return <Modal title="Add a demo site update" description="Simulated incoming report · no message is sent" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button className="primary" icon={Plus} onClick={()=>onSave({itemId:id,completion:pct,area,message,photo})}>Add for review</Button></>}><div className="field-grid"><FormField className="field-full" label="Work item"><SelectField className="form-select" aria-label="Demo report work item" value={id} onChange={e=>choose(e.target.value)}>{items.map(i=><option key={i.id} value={i.id}>{i.id} · {i.description}</option>)}</SelectField></FormField><FormField label="Area">{allocation.split?<SelectField aria-label="Demo report area" value={area} onChange={e=>{const value=e.target.value;setArea(value);setMessage(old=>old.replace(` | ${area} | `,` | ${value} | `));}}><option value="" disabled>Choose an allocated area</option>{allocation.areas.map(entry=><option key={entry.areaId} value={`Area ${entry.code}`}>{entry.code} · {num(entry.quantity)} {items.find(item=>item.id===id)?.unit}</option>)}</SelectField>:<input className="form-input" aria-label="Demo report area" value={area} onChange={e=>{const value=e.target.value;setArea(value);setMessage(old=>old.replace(` | ${area} | `,` | ${value} | `));}}/>}</FormField><FormField label="Total complete (%)"><input className="form-input" aria-label="Demo completion percentage" type="number" min="0" max="100" value={pct} onChange={e=>{setPct(e.target.value);setMessage(m=>m.replace(/COMPLETE=[\d.]+%/,`COMPLETE=${e.target.value}%`));}}/></FormField><FormField className="field-full" label="Original message"><textarea className="form-textarea" aria-label="Demo report message" rows={3} value={message} onChange={e=>setMessage(e.target.value)}/></FormField><label className="field-full photo-upload"><ImagePlus size={18}/>{photo?'Photo attached · choose another':'Attach a demo photo (optional)'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={attach}/></label>{photo&&<img className="photo-thumb" src={photo} alt="Demo attachment preview"/>}</div>{allocation.split&&<p className="site-report-review-help">Choose an allocated area: {allocation.areas.map(entry=>`${entry.code} (${num(entry.quantity)} ${items.find(item=>item.id===id)?.unit || ''})`).join(' · ')}. Completion is the total for that area.</p>}<div className="notice info"><Info size={16}/><span>Structured inputs set the proposed fields. AI parsing is not connected. The report stays pending until verified.</span></div></Modal>;
}

import type { Project, Workspace, WhatsAppMessage } from '../types/domain';
import { createDemoProject } from './demo-project.ts';
import { confirmContractBaseline } from './contract-versions.ts';
import { installDrawing, removeMappedArea, saveAreaMapping } from './drawing-mapping.ts';
import { getAreaAllocationSnapshot } from './area-allocations.ts';

/** Independent fictional example; existing projects and their saved claims are untouched. */
export function createAreaSplitDemo(workspace: Workspace, now = new Date()): {outcome:'updated'; workspace:Workspace; project:Project} | {outcome:'invalid'; error:string; workspace:Workspace} {
  const invalid=(error:string)=>({outcome:'invalid' as const,error,workspace});
  if(!Array.isArray(workspace?.projects) || !Number.isFinite(now.getTime()))return invalid('Choose a workspace before opening the area split demo.');
  let index=1;
  while(workspace.projects.some(project=>project.id===`AREA-SPLIT${String(index).padStart(2,'0')}` || project.code===`AREA-SPLIT${String(index).padStart(2,'0')}`))index++;
  const code=`AREA-SPLIT${String(index).padStart(2,'0')}`;
  let project=createDemoProject({code,name:'Area quantity split (Demo)',country:'Singapore'},now);
  project={...project,areaSplitDemo:true,items:project.items.map(item=>({...item,needsReview:false})),
    description:'One 1,200 m² wall-cladding item, split into 720 m² west and 480 m² east. Mock percentages are cumulative within each area.',
    contract:{...project.contract,sampleNote:'Fictional area split: the original 1,200 m² work item stays one contract and claim line.'},whatsappMessages:[]};
  const before=new Date(now.getTime()-120_000);
  const confirmed=confirmContractBaseline(project,before);
  if(confirmed.outcome==='invalid')return invalid(confirmed.error);
  project=confirmed.project;
  const installed=installDrawing(project,{inputKind:'sample'},new Date(now.getTime()-110_000));
  if(installed.outcome==='invalid')return invalid(installed.error);
  project=installed.project;
  const west=project.drawingMapping!.areas[0];
  for(const area of project.drawingMapping!.areas.slice(1)) {
    const removed=removeMappedArea(project,area.id,new Date(now.getTime()-100_000));
    if(removed.outcome==='invalid')return invalid(removed.error);
    project=removed.project;
  }
  const westSaved=saveAreaMapping(project,{areaId:west.id,drawingId:project.drawingMapping!.drawing!.id,code:'WEST',name:'Block A — west wall',page:1,position:{x:0.18,y:0.47},workItemIds:['WI-001'],workItemQuantities:{'WI-001':720}},new Date(now.getTime()-90_000));
  if(westSaved.outcome==='invalid')return invalid(westSaved.error);
  project=westSaved.project;
  const eastSaved=saveAreaMapping(project,{drawingId:project.drawingMapping!.drawing!.id,code:'EAST',name:'Block A — east wall',page:1,position:{x:0.42,y:0.47},workItemIds:['WI-001'],workItemQuantities:{'WI-001':480}},new Date(now.getTime()-80_000));
  if(eastSaved.outcome==='invalid')return invalid(eastSaved.error);
  project=eastSaved.project;
  const messages:WhatsAppMessage[]=project.drawingMapping!.areas.map((area,index)=>({
    id:`${code}-WA-${index+1}`,projectId:project.id,projectCode:project.code,kind:'progress',status:'new',sender:index?'Ravi · Demo worker':'Ali · Demo worker',senderRole:'Site worker · demo',
    date:new Date(now.getTime()-(index?30_000:60_000)).toISOString(),itemId:'WI-001',area:area.code,areaId:area.id,location:'Block A',completion:index?25:50,completionBasis:'cumulative',
    areaProgress:getAreaAllocationSnapshot(project,area.id,'WI-001')!,
    text:`${code} | Block A | Area ${area.code} | WI-001 | COMPLETE=${index?25:50}% TOTAL\nCladding in this area is ${index?25:50}% complete. This is the cumulative total for the ${index?480:720} m² area, not additional work.`,
    photo:index?'/assets/demo-w5-north-facade.jpg':'/assets/demo-w3-south-facade.jpg',photoAlt:'Generated facade-access illustration reused for the area split demo; not actual cladding evidence',demo:true,origin:'simulated',channel:'whatsapp-mock',
    processingNote:'Explicit mock area report. Process each area, then verify separately; totals are quantity weighted.'
  }));
  project={...project,whatsappMessages:messages,reports:[],claimDrafts:[],claimTracking:[],voReviews:[],messageClarifications:[]};
  const {id,name,country,description,contract,code:projectCode,seed,...workflow}=project;
  project.seed=structuredClone(workflow);
  return {outcome:'updated',project,workspace:{...workspace,activeProjectId:project.id,projects:[...workspace.projects,project]}};
}

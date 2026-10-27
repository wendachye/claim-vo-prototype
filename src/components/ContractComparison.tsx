import type { ComponentProps } from 'react';
import type { Project, WorkItem } from '../types/domain';
import { useEffect, useState } from 'react';
import { FileText, ListChecks } from 'lucide-react';
import { SourcePreview } from './SourcePreview';
import { ContractEditor } from './ContractEditor';
import { getAreasForItem } from '../data/drawing-mapping';
import { getWorkItemSiteMessage } from '../data/contract-work-links';

export function ContractComparison({ project, item, checkIssue, onSave, onNext, nextLabel, onOpenMessage }: { project: Project; item: WorkItem; checkIssue?: ComponentProps<typeof ContractEditor>['checkIssue']; onSave: ComponentProps<typeof ContractEditor>['onSave']; onNext?: () => void; nextLabel?: string; onOpenMessage?: (itemId: string) => void }) {
  const [panel, setPanel] = useState('item');
  useEffect(() => setPanel('item'), [item.id]);
  const relatedAreas = getAreasForItem(project, item.id);
  const hasMessage = Boolean(getWorkItemSiteMessage(project, item.id));
  return <div className="contract-comparison" data-panel={panel}>
    <div className="contract-comparison-tabs" role="group" aria-label="Contract comparison view"><button type="button" aria-pressed={panel === 'item'} onClick={() => setPanel('item')}><ListChecks size={15} />Work item</button><button type="button" aria-pressed={panel === 'source'} onClick={() => setPanel('source')}><FileText size={15} />Source document</button></div>
    <div className="review-layout"><div className="contract-source-panel"><SourcePreview compact key={project.id} item={item} contract={project.contract} sourceItems={project.sourceItems} /></div><div className="contract-editor-panel"><ContractEditor projectId={project.id} revision={project.version} key={`${project.id}-${item.id}-${project.version}-${item.reviewedAt || ''}`} item={item} checkIssue={checkIssue} contract={project.contract} sourceItems={project.sourceItems} locked={project.locked} relatedAreas={relatedAreas} onOpenMessage={hasMessage && onOpenMessage ? () => onOpenMessage(item.id) : undefined} onSave={onSave} nextLabel={nextLabel} onNext={onNext} /></div></div>
  </div>;
}

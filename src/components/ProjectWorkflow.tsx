import './project-workflow.css';

export function SiteViewTabs({ view, onNavigate, pending = 0 }: { view: string; onNavigate: (route: string) => void; pending?: number }) {
  return <nav className="site-view-tabs" aria-label="Site updates sections"><button type="button" className={view === 'whatsapp' ? 'current' : ''} aria-current={view === 'whatsapp' ? 'page' : undefined} onClick={() => onNavigate('whatsapp')}>Messages</button><button type="button" className={view === 'completion' ? 'current' : ''} aria-current={view === 'completion' ? 'page' : undefined} onClick={() => onNavigate('completion')}>Progress{pending > 0 && <span>{pending} to check</span>}</button></nav>;
}

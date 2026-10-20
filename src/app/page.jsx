'use client';

import dynamic from 'next/dynamic';

// The prototype keeps browser-local records and hash links. Mount it only in
// the browser so server rendering cannot read or replace a saved workspace.
const Workspace = dynamic(() => import('../App.jsx').then((module) => module.App), {
  ssr: false,
  loading: () => <main className="workspace-loading" role="status">Opening project workspace…</main>,
});

export default function HomePage() {
  return <Workspace />;
}

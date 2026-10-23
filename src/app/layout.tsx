import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../shadcn.css';
import '../styles.css';

export const metadata: Metadata = {
  title: 'Claim & VO · Project workspace',
  description: 'Construction contract review, site completion and QS claim preparation prototype.',
};

export const viewport: Viewport = { themeColor: '#0f172a' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><div id="root">{children}</div></body></html>;
}

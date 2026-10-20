import '../styles.css';

export const metadata = {
  title: 'Claim & VO · Project workspace',
  description: 'Construction contract review, site completion and QS claim preparation prototype.',
};

export const viewport = { themeColor: '#0f172a' };

export default function RootLayout({ children }) {
  return <html lang="en"><body><div id="root">{children}</div></body></html>;
}

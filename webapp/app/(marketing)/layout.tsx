import { Navigation } from '@/app/components/Navigation';
import { Footer } from '@/app/components/Footer';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#f9f9fa',
      color: '#1A1C1D',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <Navigation />
      <div style={{ flex: 1, paddingTop: 80 }}>
        {children}
      </div>
      <Footer />
    </div>
  );
}

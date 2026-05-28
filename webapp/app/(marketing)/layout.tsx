import { Navigation } from '@/app/components/Navigation';
import { Footer } from '@/app/components/Footer';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
    }}>
      <Navigation />
      <div style={{ flex: 1, paddingTop: 80 }}>
        {children}
      </div>
      <Footer />
    </div>
  );
}

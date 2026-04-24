'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import styles from '../shell.module.css';

interface Props {
  username: string;
  avatarInitial: string;
  avatarUrl: string | null;
  isPro: boolean;
  isAffiliate: boolean;
  dueReminderCount: number;
  children: React.ReactNode;
}

export default function DashboardChrome({ username, avatarInitial, avatarUrl, isPro, isAffiliate, dueReminderCount, children }: Props) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  // Hydration-safe: always start expanded, read localStorage after mount
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('sidebarCollapsed');
    if (stored !== null) setCollapsed(stored === 'true');
  }, []);

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  return (
    <div className={styles.page}>

      {/* ── Top App Bar ── */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <a href="/" className={styles.logo}>Clipmark</a>
          <nav className={styles.topNav}>
            <a href="/dashboard" className={`${styles.topNavLink} ${isActive('/dashboard') ? styles.topNavLinkActive : ''}`}>
              All Bookmarks
            </a>
            <a href="/dashboard/queue" className={`${styles.topNavLink} ${isActive('/dashboard/queue') ? styles.topNavLinkActive : ''}`}>
              Reminders
              {dueReminderCount > 0 && <span className={styles.topNavBadge}>{dueReminderCount}</span>}
            </a>
            <a href="/dashboard/shared" className={`${styles.topNavLink} ${isActive('/dashboard/shared') ? styles.topNavLinkActive : ''}`}>
              Shared ↗
            </a>
          </nav>
        </div>
        <div className={styles.topBarRight}>
          <div className={styles.searchBox}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6c7a77' }}>search</span>
            <input type="text" placeholder="Search your bookmarks..." className={styles.searchInput} />
          </div>
          {!isPro
            ? <a href="/upgrade" className={styles.upgradeCta}>✦ Upgrade</a>
            : <a href="/upgrade" className={styles.upgradeCta} style={{ background: 'rgba(0,107,95,0.08)', color: '#006b5f', border: '1px solid rgba(0,107,95,0.2)' }}>✦ Pro</a>
          }
          {/* Avatar — always visible */}
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={username} className={styles.avatar} title={username} />
          ) : (
            <div className={styles.avatarFallback} title={username}>{avatarInitial}</div>
          )}
          {/* Sign-out only on desktop — tablet/mobile uses sidebar */}
          <form action="/auth/signout" method="POST" className={styles.signOutTopBarForm}>
            <button type="submit" className={styles.iconBtn} title="Sign out">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            </button>
          </form>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar}${collapsed ? ' ' + styles.sidebarCollapsed : ''}`}>

        {/* Sidebar top row: brand + collapse toggle */}
        <div className={styles.sidebarTopRow}>
          <div className={styles.sidebarBrand}>
            <div className={styles.sidebarBrandIcon}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>
            </div>
            <div className={styles.sidebarBrandText}>
              <p className={styles.sidebarBrandName}>The Curator</p>
              <p className={styles.sidebarBrandSub}>Editorial Collection</p>
            </div>
          </div>
          <button className={styles.collapseBtn} onClick={handleToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {collapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        </div>

        <nav className={styles.sideNav}>
          <p className={styles.sideNavSection}>Library</p>
          <a href="/dashboard" className={`${styles.sideNavItem} ${isActive('/dashboard') ? styles.sideNavItemActive : ''}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>bookmarks</span>
            <span className={styles.sideNavItemLabel}>All Bookmarks</span>
          </a>
          <a href="/dashboard/videos" className={`${styles.sideNavItem} ${isActive('/dashboard/videos') ? styles.sideNavItemActive : ''}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>video_library</span>
            <span className={styles.sideNavItemLabel}>Videos</span>
          </a>
          <a href="/dashboard/queue" className={`${styles.sideNavItem} ${isActive('/dashboard/queue') ? styles.sideNavItemActive : ''}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>schedule</span>
            <span className={styles.sideNavItemLabel}>Reminders</span>
            {dueReminderCount > 0 && <span className={styles.dueBadge}>{dueReminderCount}</span>}
          </a>
          <p className={styles.sideNavSection}>Curations</p>
          <a href="/dashboard/analytics" className={`${styles.sideNavItem} ${isActive('/dashboard/analytics') ? styles.sideNavItemActive : ''}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>bar_chart</span>
            <span className={styles.sideNavItemLabel}>Analytics</span>
          </a>
          <a href="/dashboard/groups" className={`${styles.sideNavItem} ${isActive('/dashboard/groups') ? styles.sideNavItemActive : ''}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>folder_shared</span>
            <span className={styles.sideNavItemLabel}>Groups</span>
          </a>
          <a href="/dashboard/shared" className={`${styles.sideNavItem} ${isActive('/dashboard/shared') ? styles.sideNavItemActive : ''}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>ios_share</span>
            <span className={styles.sideNavItemLabel}>Shared</span>
          </a>
          <p className={styles.sideNavSection}>Account</p>
          {isAffiliate && (
            <a href="/dashboard/affiliate" className={`${styles.sideNavItem} ${isActive('/dashboard/affiliate') ? styles.sideNavItemActive : ''}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>campaign</span>
              <span className={styles.sideNavItemLabel}>Affiliate</span>
            </a>
          )}
          <a href="/dashboard/referral" className={`${styles.sideNavItem} ${isActive('/dashboard/referral') ? styles.sideNavItemActive : ''}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>redeem</span>
            <span className={styles.sideNavItemLabel}>Refer &amp; Earn</span>
          </a>
          {!isPro ? (
            <a href="/upgrade" className={`${styles.sideNavItem} ${styles.sideNavUpgrade}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>auto_awesome</span>
              <span className={styles.sideNavItemLabel}>Upgrade</span>
            </a>
          ) : (
            <a href="/upgrade" className={styles.sideNavItem}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>workspace_premium</span>
              <span className={styles.sideNavItemLabel}>Manage Subscription</span>
            </a>
          )}
          <form action="/auth/signout" method="POST" style={{ width: '100%' }}>
            <button type="submit" className={`${styles.sideNavItem} ${styles.signOutBtn}`}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
              <span className={styles.sideNavItemLabel}>Sign Out</span>
            </button>
          </form>
        </nav>

      </aside>

      {/* ── Page content ── */}
      <main className={`${styles.main}${collapsed ? ' ' + styles.mainCollapsed : ''}`}>
        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className={styles.mobileNav}>
        <a href="/dashboard" className={`${styles.mobileNavItem} ${isActive('/dashboard') ? styles.mobileNavItemActive : ''}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: isActive('/dashboard') ? "'FILL' 1" : "'FILL' 0" }}>bookmarks</span>
          <span className={styles.mobileNavLabel}>Bookmarks</span>
        </a>
        <a href="/dashboard/queue" className={`${styles.mobileNavItem} ${isActive('/dashboard/queue') ? styles.mobileNavItemActive : ''}`} style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: isActive('/dashboard/queue') ? "'FILL' 1" : "'FILL' 0" }}>schedule</span>
          <span className={styles.mobileNavLabel}>Reminders</span>
          {dueReminderCount > 0 && <span className={styles.dueBadgeMobile} />}
        </a>
        <a href="/dashboard/groups" className={`${styles.mobileNavItem} ${isActive('/dashboard/groups') ? styles.mobileNavItemActive : ''}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>folder</span>
          <span className={styles.mobileNavLabel}>Groups</span>
        </a>
        <a href="/upgrade" className={styles.mobileNavItem}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>grade</span>
          <span className={styles.mobileNavLabel}>Pro</span>
        </a>
      </nav>

    </div>
  );
}

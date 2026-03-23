'use client';

import styles from '../page.module.css';

interface HeatmapCell {
  date: string;
  count: number;
}

interface TagStat {
  name: string;
  count: number;
  color: string;
}

interface Props {
  heatmap: HeatmapCell[];
  tags: TagStat[];
  totalBookmarks: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AnalyticsContent({ heatmap, tags }: Props) {
  const maxHeat = Math.max(...heatmap.map(c => c.count), 1);
  const maxTag = Math.max(...tags.map(t => t.count), 1);

  return (
    <div className={styles.analyticsGrid}>

      {/* ── Activity Heatmap ── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_month</span>
          Activity — Last 14 Days
        </h2>
        <div className={styles.heatmap}>
          {heatmap.map(cell => {
            const intensity = cell.count / maxHeat;
            return (
              <div
                key={cell.date}
                className={styles.heatCell}
                style={{ opacity: cell.count === 0 ? 0.08 : 0.15 + intensity * 0.85 }}
                title={`${formatDate(cell.date)}: ${cell.count} bookmark${cell.count !== 1 ? 's' : ''}`}
              >
                <span className={styles.heatDate}>
                  {new Date(cell.date + 'T00:00:00').getDate()}
                </span>
                {cell.count > 0 && (
                  <span className={styles.heatCount}>{cell.count}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Tag Breakdown ── */}
      {tags.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>sell</span>
            Tag Frequency
          </h2>
          <div className={styles.tagList}>
            {tags.map(tag => (
              <div key={tag.name} className={styles.tagRow}>
                <span className={styles.tagName}>#{tag.name}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${(tag.count / maxTag) * 100}%`,
                      background: tag.color,
                    }}
                  />
                </div>
                <span className={styles.tagCount}>{tag.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

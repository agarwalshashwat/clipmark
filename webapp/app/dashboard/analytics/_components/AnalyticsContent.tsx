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
  videoCount: number;
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
          <div className="cm-icon-badge">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>calendar_month</span>
          </div>
          Activity — Last 14 Days
        </h2>
        <div className={styles.heatmap}>
          {heatmap.map(cell => {
            let level = 0;
            if (cell.count > 0) {
              const ratio = cell.count / maxHeat;
              if (ratio < 0.25) level = 1;
              else if (ratio < 0.5) level = 2;
              else if (ratio < 0.75) level = 3;
              else level = 4;
            }

            return (
              <div
                key={cell.date}
                className={styles.dayCell}
                data-level={level}
              >
                <div className={styles.tooltip}>
                  {formatDate(cell.date)}: {cell.count} bookmarks
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Tag Breakdown ── */}
      {tags.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            <div className="cm-icon-badge">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>sell</span>
            </div>
            Tag Frequency
          </h2>
          <div className={styles.tagList}>
            {tags.map(tag => (
              <div key={tag.name} className={styles.tagRow}>
                <span className={styles.tagName}>#{tag.name}</span>
                <div className={styles.barWrap}>
                  <div
                    className={styles.bar}
                    style={{
                      width: `${(tag.count / maxTag) * 100}%`,
                      background: tag.color,
                    }}
                  />
                </div>
                <span className={styles.tagCount}>{tag.count}</span>
                <span className={styles.tagVideoCount}>{tag.videoCount} video{tag.videoCount !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';

function getNextSunday(): Date {
  const now = new Date();
  const daysUntil = (7 - now.getDay()) % 7 || 7; // always 1–7
  const d = new Date(now);
  d.setDate(now.getDate() + daysUntil);
  d.setHours(23, 59, 59, 999);
  return d;
}

interface TimeLeft { days: number; hours: number; minutes: number; seconds: number; }

function calcTimeLeft(target: Date): TimeLeft {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

export default function LifetimeCountdown() {
  const [target, setTarget]     = useState<Date>(() => getNextSunday());
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(getNextSunday()));
  const [extended, setExtended] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => {
      if (Date.now() >= target.getTime()) {
        setExtended(true);
        const next = getNextSunday();
        setTarget(next);
        setTimeLeft(calcTimeLeft(next));
      } else {
        setTimeLeft(calcTimeLeft(target));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [target]);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div style={{ marginTop: 20, marginBottom: 4 }}>
      {extended && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(20,184,166,0.15)', color: '#14B8A6',
          padding: '3px 10px', borderRadius: 9999,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 10,
        }}>
          ✦ Lifetime Extended on Request
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 12, color: '#64748b',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          Offer ends in:
        </span>
        {([
          { value: timeLeft.days,    label: 'd' },
          { value: timeLeft.hours,   label: 'h' },
          { value: timeLeft.minutes, label: 'm' },
          { value: timeLeft.seconds, label: 's' },
        ] as const).map(({ value, label }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, padding: '5px 9px',
            textAlign: 'center', minWidth: 38,
          }}>
            <div style={{
              fontSize: 18, fontWeight: 800, color: '#f9fafb',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: '-0.5px', lineHeight: 1.1,
            }}>
              {pad(value)}
            </div>
            <div style={{
              fontSize: 9, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

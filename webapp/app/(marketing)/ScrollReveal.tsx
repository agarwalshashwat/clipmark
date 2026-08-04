'use client';

import { useEffect, useRef, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}

// Fades/slides content in the first time it scrolls into view. No animation
// library — a few dozen lines of IntersectionObserver, per the "how it
// works" section's Option A spec (docs/guided-tour-spec.md §5).
export function ScrollReveal({ children, delayMs = 0, className = '' }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only hide-then-reveal once we know JS actually ran — otherwise a
    // no-JS visitor (or a failed script load) would be stuck looking at
    // permanently-invisible content.
    document.documentElement.classList.add('cm-js-reveal');

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`cm-reveal ${visible ? 'cm-reveal--visible' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

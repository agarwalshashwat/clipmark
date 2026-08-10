'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ERROR_FIELD, LIMITS, validateFeedback } from '@/app/lib/feedback';

/**
 * The /feedback form.
 *
 * A client component because the interesting parts are all client-side: the star
 * row, validation as you go, and a success state that replaces the form without
 * a navigation. It runs the SAME validateFeedback() the route runs, so the two
 * cannot disagree about what a valid submission is; /api/feedback re-runs it on
 * the parsed body, which is the copy that actually decides.
 *
 * `source` is filled in from `?from=` when a link carries one (so an extension
 * or side-panel link can identify itself) and falls back to the referrer's host,
 * then to 'site'. It is read in an effect from `window.location` rather than via
 * `useSearchParams` so the page stays statically renderable — `useSearchParams`
 * opts the whole route into client-side rendering.
 */

const STAR_LABELS: Record<number, string> = {
  1: 'Not working for me',
  2: 'Rough, but there is something here',
  3: 'Useful, with caveats',
  4: 'I like it',
  5: 'I would be annoyed to lose it',
};

type Status = 'idle' | 'submitting' | 'success' | 'error';

interface FieldErrors {
  rating?: string;
  answers?: string;
  name?: string;
  email?: string;
  form?: string;
}

const REFERRER_TO_SOURCE = (referrer: string): string | null => {
  try {
    const { hostname, protocol } = new URL(referrer);
    // Same-origin navigation tells us nothing beyond "the site".
    if (typeof window !== 'undefined' && hostname === window.location.hostname) return null;
    if (protocol === 'chrome-extension:') return 'extension';
    return `ref:${hostname}`;
  } catch {
    return null;
  }
};

export function FeedbackForm() {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [liked, setLiked] = useState('');
  const [confusing, setConfusing] = useState('');
  const [featureRequest, setFeatureRequest] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('site');

  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  // Bumped on every failed attempt. Without it, a second failure in a row leaves
  // `status` on 'error', the effect below never re-runs, and focus stays on the
  // submit button as though nothing happened.
  const [failures, setFailures] = useState(0);

  const errorBannerRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('from');
    if (from) {
      setSource(from.slice(0, LIMITS.source));
      return;
    }
    const fromReferrer = document.referrer ? REFERRER_TO_SOURCE(document.referrer) : null;
    if (fromReferrer) setSource(fromReferrer.slice(0, LIMITS.source));
  }, []);

  // Move focus to the banner when a submit fails, so a screen-reader user is
  // told why instead of being left on a button that appears to have done nothing.
  useEffect(() => {
    if (status === 'error') errorBannerRef.current?.focus();
  }, [status, failures]);

  // The success panel REPLACES the form, so a keyboard or screen-reader user is
  // otherwise left focused on a button that no longer exists. Focusing the panel
  // is also what makes the confirmation reliably announced — content inserted
  // together with its own live region often is not.
  useEffect(() => {
    if (status === 'success') successRef.current?.focus();
  }, [status]);

  /** Every path that fails a submit goes through here. */
  function failWith(message: string, fields: FieldErrors = {}) {
    setErrors(fields);
    setFormError(message);
    setFailures((n) => n + 1);
    setStatus('error');
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      rating,
      liked: liked.trim() || null,
      confusing: confusing.trim() || null,
      feature_request: featureRequest.trim() || null,
      name: name.trim() || null,
      email: email.trim() || null,
      source,
    };

    // The same function the route runs, so the client cannot accept something
    // the server will reject (or vice versa).
    const check = validateFeedback(payload);
    if (!check.ok) {
      const field = ERROR_FIELD[check.error];
      failWith(
        field === 'form' ? check.message : 'One thing left to fix before this can send.',
        { [field]: check.message },
      );
      return;
    }

    setErrors({});
    setFormError('');
    setStatus('submitting');
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        failWith(body.message ?? 'Something went wrong on our side. Please try again.');
        return;
      }
      setStatus('success');
    } catch {
      // Network-level failure: the answers are still in state, so say so rather
      // than implying the note was lost.
      failWith('That did not reach us — check your connection and press send again. Your answers are still here.');
    }
  }

  function reset() {
    setRating(0);
    setLiked('');
    setConfusing('');
    setFeatureRequest('');
    setName('');
    setEmail('');
    setErrors({});
    setFormError('');
    setStatus('idle');
  }

  if (status === 'success') {
    return (
      <div
        className="fb-card"
        role="status"
        aria-live="polite"
        tabIndex={-1}
        ref={successRef}
        style={{ textAlign: 'center' }}
      >
        <div className="fb-success-badge" aria-hidden="true">
          <span className="material-symbols-outlined" style={{ fontSize: 30 }}>check</span>
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: 'var(--text)',
            margin: '0 0 12px',
          }}
        >
          Got it — thank you.
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 auto 28px', maxWidth: 460 }}>
          That is genuinely useful, especially the awkward parts.
          {email.trim()
            ? ' You left an email, so expect a reply from a person — not a newsletter.'
            : ' No email, so this is anonymous: if you want an answer, send another with one.'}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="fb-ghost" onClick={reset}>
            Send another note
          </button>
          <a href="/" className="fb-ghost" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Back to ClipMark
          </a>
        </div>
      </div>
    );
  }

  const showStars = hovered || rating;

  return (
    <form className="fb-card" onSubmit={onSubmit} noValidate>
      {formError && (
        <div
          className="fb-banner fb-banner-error"
          role="alert"
          tabIndex={-1}
          ref={errorBannerRef}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20, color: 'var(--danger)' }}>
            error
          </span>
          <span>{formError}</span>
        </div>
      )}

      {/* ── Rating ───────────────────────────────────────────────────────── */}
      <fieldset className="fb-fieldset">
        <legend className="fb-label">How is ClipMark working for you overall?</legend>
        <p className="fb-hint" id={id('rating-hint')}>
          One to five. Go with your gut — a 2 with a reason is more useful than a polite 4.
        </p>
        <div className="fb-stars">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="fb-star"
              onMouseEnter={() => setHovered(value)}
              onMouseLeave={() => setHovered(0)}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                aria-describedby={id('rating-hint')}
                aria-label={`${value} out of 5 — ${STAR_LABELS[value]}`}
                onChange={() => {
                  setRating(value);
                  setErrors((prev) => ({ ...prev, rating: undefined }));
                }}
              />
              <span
                className="fb-star-glyph"
                aria-hidden="true"
                data-on={showStars >= value ? (hovered ? 'hover' : 'selected') : 'off'}
              >
                <StarIcon filled={showStars >= value} />
              </span>
            </label>
          ))}
          <span className="fb-star-caption" aria-hidden="true">
            {showStars ? STAR_LABELS[showStars] : ''}
          </span>
        </div>
        {errors.rating && <span className="fb-field-error">{errors.rating}</span>}
      </fieldset>

      {/* ── The three questions ──────────────────────────────────────────── */}
      {errors.answers && (
        <span className="fb-field-error" style={{ marginTop: 0, marginBottom: 20 }}>
          {errors.answers}
        </span>
      )}

      <Answer
        id={id('liked')}
        label="What do you like so far?"
        hint="Even one small thing. If something made you go “oh, nice” — that is the part worth protecting."
        placeholder="The thing that actually worked…"
        value={liked}
        onChange={setLiked}
        onFirstEdit={() => setErrors((prev) => ({ ...prev, answers: undefined }))}
      />

      <Answer
        id={id('confusing')}
        label="What is confusing or missing?"
        hint="Where did you get stuck, or expect something that was not there? This is the most useful box on the page — please be blunt."
        placeholder="I could not figure out how to…"
        value={confusing}
        onChange={setConfusing}
        onFirstEdit={() => setErrors((prev) => ({ ...prev, answers: undefined }))}
      />

      <Answer
        id={id('feature')}
        label="What would you want next?"
        hint="A feature, a fix, or something ClipMark should stop doing."
        placeholder="It would be great if…"
        value={featureRequest}
        onChange={setFeatureRequest}
        onFirstEdit={() => setErrors((prev) => ({ ...prev, answers: undefined }))}
      />

      {/* ── Optional identity ────────────────────────────────────────────── */}
      <div className="fb-field">
        <label className="fb-label" htmlFor={id('name')}>
          Your name <span className="fb-optional">Optional</span>
        </label>
        <p className="fb-hint">So I know whose notes I am reading.</p>
        <input
          id={id('name')}
          className="fb-input"
          type="text"
          autoComplete="name"
          maxLength={LIMITS.name}
          value={name}
          aria-invalid={errors.name ? 'true' : undefined}
          aria-describedby={errors.name ? id('name-error') : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="First name is plenty"
        />
        {errors.name && (
          <span className="fb-field-error" id={id('name-error')}>
            {errors.name}
          </span>
        )}
      </div>

      <div className="fb-field">
        <label className="fb-label" htmlFor={id('email')}>
          Email <span className="fb-optional">Optional</span>
        </label>
        <p className="fb-hint" id={id('email-hint')}>
          Only so I can reply about this feedback. Leave it blank and this stays anonymous.
        </p>
        <input
          id={id('email')}
          className="fb-input"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={LIMITS.email}
          value={email}
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={errors.email ? `${id('email-hint')} ${id('email-error')}` : id('email-hint')}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          placeholder="you@example.com"
        />
        {errors.email && (
          <span className="fb-field-error" id={id('email-error')}>
            {errors.email}
          </span>
        )}
      </div>

      {/* Provenance, not tracking: which surface the link came from. Sent as a
          hidden value so it is visible in the DOM rather than smuggled. */}
      <input type="hidden" name="source" value={source} />

      <div className="fb-actions">
        <button type="submit" className="fb-submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Sending…' : 'Send feedback'}
        </button>
        <p className="fb-note">
          Goes straight to the person building ClipMark. No ticket queue.
        </p>
      </div>
    </form>
  );
}

/** One of the three long-answer questions, with its own character counter. */
function Answer({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
  onFirstEdit,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  onFirstEdit: () => void;
}) {
  return (
    <div className="fb-field">
      <label className="fb-label" htmlFor={id}>
        {label}
      </label>
      <p className="fb-hint" id={`${id}-hint`}>
        {hint}
      </p>
      <textarea
        id={id}
        className="fb-textarea"
        rows={4}
        maxLength={LIMITS.answer}
        value={value}
        aria-describedby={`${id}-hint`}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          onFirstEdit();
        }}
      />
      {value.length > 0 && (
        <span className="fb-count">
          {value.length} / {LIMITS.answer}
        </span>
      )}
    </div>
  );
}

/** Star glyph. Inline SVG rather than a Material Symbols ligature because the
 *  vendored icon font is instanced at FILL 0 — it has no filled star to switch
 *  to, and a rating row needs both states. `currentColor` keeps it on tokens. */
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" role="presentation" focusable="false">
      <path
        d="M12 3.6l2.47 5.1 5.63.78-4.1 3.9 1 5.52L12 16.3l-5 2.6 1-5.52-4.1-3.9 5.63-.78L12 3.6z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

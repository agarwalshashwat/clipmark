'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ERROR_FIELD,
  LIMITS,
  REASONS,
  normaliseVersion,
  validateUninstallFeedback,
  type ReasonValue,
} from '@/app/lib/uninstall-feedback';
import { CHROME_STORE_URL } from '@/app/lib/constants';

/**
 * The /uninstall survey.
 *
 * Everything about this form assumes the person filling it in has already left:
 * one required tap, two optional fields, no account, no "are you sure?", and no
 * attempt to win them back before they have said anything. The reinstall link
 * appears only after they submit, and only as a link.
 *
 * It runs the SAME validateUninstallFeedback() the route runs, so the two cannot
 * disagree about what a valid submission is; /api/uninstall-feedback re-runs it
 * on the parsed body, which is the copy that actually decides.
 *
 * The extension version is read in an effect from `window.location` rather than
 * via `useSearchParams`, matching FeedbackForm: `useSearchParams` opts the whole
 * route into client-side rendering. normaliseVersion() drops anything that is
 * not version-shaped, so the query string can't be used to smuggle an
 * identifier into the table.
 */

type Status = 'idle' | 'submitting' | 'success' | 'error';

interface FieldErrors {
  reason?: string;
  message?: string;
  email?: string;
  form?: string;
}

export function UninstallForm() {
  const [reason, setReason] = useState<ReasonValue | ''>('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [version, setVersion] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  // Bumped on every failed attempt, so a second failure in a row still moves
  // focus to the banner instead of leaving it on the submit button.
  const [failures, setFailures] = useState(0);

  const errorBannerRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;

  useEffect(() => {
    setVersion(normaliseVersion(new URLSearchParams(window.location.search).get('v')));
  }, []);

  useEffect(() => {
    if (status === 'error') errorBannerRef.current?.focus();
  }, [status, failures]);

  // The success panel REPLACES the form, so focus has to move or a keyboard user
  // is left on a button that no longer exists.
  useEffect(() => {
    if (status === 'success') successRef.current?.focus();
  }, [status]);

  function failWith(text: string, fields: FieldErrors = {}) {
    setErrors(fields);
    setFormError(text);
    setFailures((n) => n + 1);
    setStatus('error');
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      reason,
      message: message.trim() || null,
      email: email.trim() || null,
      extension_version: version,
    };

    const check = validateUninstallFeedback(payload);
    if (!check.ok) {
      const field = ERROR_FIELD[check.error];
      failWith(
        field === 'form' ? check.message : 'One thing left before this can send.',
        { [field]: check.message },
      );
      return;
    }

    setErrors({});
    setFormError('');
    setStatus('submitting');
    try {
      const response = await fetch('/api/uninstall-feedback', {
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
      failWith('That did not reach us — check your connection and press send again. Your answer is still here.');
    }
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
          Thank you — that helps.
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 auto 28px', maxWidth: 460 }}>
          {email.trim()
            ? 'You left an email, so if there is something worth telling you, a person will write — not a newsletter.'
            : 'No email, so this is anonymous. Nothing else to do — you can close this tab.'}
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-muted)', margin: '0 auto', maxWidth: 460 }}>
          If you ever want it back, it&apos;s{' '}
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--brand-ink)', fontWeight: 600 }}
          >
            here on the Chrome Web Store
          </a>
          . No hard feelings either way.
        </p>
      </div>
    );
  }

  return (
    <form className="fb-card" onSubmit={onSubmit} noValidate>
      {formError && (
        <div className="fb-banner fb-banner-error" role="alert" tabIndex={-1} ref={errorBannerRef}>
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{ fontSize: 20, color: 'var(--danger)' }}
          >
            error
          </span>
          <span>{formError}</span>
        </div>
      )}

      {/* ── Reason (the only required answer) ─────────────────────────────── */}
      <fieldset className="fb-fieldset">
        <legend className="fb-label">What made you uninstall?</legend>
        <p className="fb-hint">One tap. Closest is fine — nothing here is a wrong answer.</p>
        <div className="fb-choices">
          {REASONS.map(({ value, label }) => (
            <label key={value} className="fb-choice" data-selected={reason === value}>
              <input
                type="radio"
                name="reason"
                value={value}
                checked={reason === value}
                onChange={() => {
                  setReason(value);
                  setErrors((e) => ({ ...e, reason: undefined }));
                }}
              />
              <span className="fb-choice-dot" aria-hidden="true" />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {errors.reason && <p className="fb-field-error">{errors.reason}</p>}
      </fieldset>

      {/* ── Optional free text ────────────────────────────────────────────── */}
      <div className="fb-field">
        <label className="fb-label" htmlFor={id('message')}>
          Anything we could&apos;ve done better? <span className="fb-optional">Optional</span>
        </label>
        <textarea
          id={id('message')}
          className="fb-textarea"
          value={message}
          maxLength={LIMITS.message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="The thing that made you give up on it…"
          aria-invalid={errors.message ? true : undefined}
        />
        {message.length > LIMITS.message - 200 && (
          <p className="fb-count">{LIMITS.message - message.length} characters left</p>
        )}
        {errors.message && <p className="fb-field-error">{errors.message}</p>}
      </div>

      {/* ── Optional email ────────────────────────────────────────────────── */}
      <div className="fb-field">
        <label className="fb-label" htmlFor={id('email')}>
          How can we reach you? <span className="fb-optional">Optional</span>
        </label>
        <p className="fb-hint">Only if you want a reply. Nothing else is stored about you.</p>
        <input
          id={id('email')}
          className="fb-input"
          type="email"
          value={email}
          maxLength={LIMITS.email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
        />
        {errors.email && <p className="fb-field-error">{errors.email}</p>}
      </div>

      <button type="submit" className="fb-submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}

"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Password field with a show/hide toggle and a Caps Lock warning.
 *
 * Shared by sign-in, user creation, admin password reset, and self-service change so the
 * toggle's accessibility and auto-hide behaviour cannot drift between copies.
 *
 * - The toggle is a pressed/unpressed button with a stable name ("Show password"), which is
 *   how screen readers expect a two-state toggle to be announced.
 * - The field re-masks itself whenever its form submits, so a revealed password is not left on
 *   screen after a failed sign-in or a successful save.
 * - The label is a sibling `<label htmlFor>` rather than a wrapper: wrapping the toggle button
 *   inside the label would fold "Show password" into the input's accessible name.
 */
export function PasswordInput({
  autoComplete,
  autoFocus,
  hint,
  label,
  name,
  onChange,
  required = true,
  trailing,
  value,
  visible: visibleProp,
  onVisibleChange,
}: {
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  /** Persistent help text, linked with aria-describedby. */
  hint?: ReactNode;
  label: string;
  name?: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** Extra controls rendered after the toggle (e.g. Suggest / Copy buttons). */
  trailing?: ReactNode;
  value: string;
  /** Optional controlled visibility, for callers that reveal a generated password. */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const capsId = `${id}-caps`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [visibleState, setVisibleState] = useState(false);
  const visible = visibleProp ?? visibleState;
  const [capsLock, setCapsLock] = useState(false);

  // Kept in a ref so the submit listener below never goes stale.
  const onVisibleChangeRef = useRef(onVisibleChange);
  useEffect(() => {
    onVisibleChangeRef.current = onVisibleChange;
  });

  function setVisible(next: boolean) {
    setVisibleState(next);
    onVisibleChange?.(next);
  }

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const hide = () => {
      setVisibleState(false);
      onVisibleChangeRef.current?.(false);
    };
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  function trackCapsLock(event: React.KeyboardEvent<HTMLInputElement>) {
    // getModifierState is undefined for some synthetic/IME events; treat that as "off".
    setCapsLock(Boolean(event.getModifierState?.("CapsLock")));
  }

  const describedBy = [hint ? hintId : null, capsLock ? capsId : null].filter(Boolean).join(" ");

  return (
    <div className="password-field">
      <label className="password-field__label" htmlFor={id}>
        <span className="meta">{label}</span>
      </label>
      <div className="modal-form__inline-field password-field__control">
        <input
          aria-describedby={describedBy || undefined}
          autoCapitalize="off"
          autoComplete={autoComplete}
          autoCorrect="off"
          autoFocus={autoFocus}
          className="input"
          data-autofocus={autoFocus ? true : undefined}
          id={id}
          name={name}
          onBlur={() => setCapsLock(false)}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={trackCapsLock}
          onKeyUp={trackCapsLock}
          ref={inputRef}
          required={required}
          spellCheck={false}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-controls={id}
          aria-label="Show password"
          aria-pressed={visible}
          className="password-toggle"
          onClick={() => setVisible(!visible)}
          title={visible ? "Hide password" : "Show password"}
          type="button"
        >
          {visible ? (
            <EyeOff aria-hidden size={18} strokeWidth={1.8} />
          ) : (
            <Eye aria-hidden size={18} strokeWidth={1.8} />
          )}
        </button>
        {trailing}
      </div>
      {capsLock && (
        <p className="password-field__caps" id={capsId} role="status">
          Caps Lock is on
        </p>
      )}
      {hint && (
        <p className="meta password-field__hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

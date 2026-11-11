"use client";

import { useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import {
  PASSWORD_POLICY_HINT,
  generatePassphrase,
  validatePassword,
  type PasswordContext,
} from "@/lib/password-policy";

/**
 * A "choose a new password" field: show/hide, a Suggest button that fills in a readable
 * passphrase (and reveals it, since the point is to read it out), a Copy button, and a live
 * policy hint. The API routes run the same validatePassword check authoritatively.
 */
export function NewPasswordField({
  autoFocus,
  context,
  label = "Password",
  onChange,
  onVisibleChange,
  value,
  visible,
}: {
  autoFocus?: boolean;
  context?: PasswordContext;
  label?: string;
  onChange: (value: string) => void;
  onVisibleChange: (visible: boolean) => void;
  value: string;
  visible: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const problem = value ? validatePassword(value, context) : null;

  function suggest() {
    onChange(generatePassphrase());
    onVisibleChange(true);
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="password-field">
      <PasswordInput
        autoComplete="new-password"
        autoFocus={autoFocus}
        hint={
          problem ? (
            <span className="password-field__problem">{problem}</span>
          ) : value ? (
            "Looks good."
          ) : (
            PASSWORD_POLICY_HINT
          )
        }
        label={label}
        onChange={(next) => {
          onChange(next);
          setCopied(false);
        }}
        onVisibleChange={onVisibleChange}
        value={value}
        visible={visible}
      />
      <div className="password-field__actions">
        <button className="button button--small button--ghost" onClick={suggest} type="button">
          Suggest a passphrase
        </button>
        <button
          className="button button--small button--ghost"
          disabled={!value}
          onClick={copy}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? "Password copied to clipboard" : ""}
        </span>
      </div>
    </div>
  );
}

import { describe, expect, it } from "vitest";
import {
  PASSPHRASE_WORD_COUNT_FOR_TESTS,
  PASSWORD_MIN_LENGTH,
  generatePassphrase,
  validatePassword,
} from "./password-policy";

describe("validatePassword", () => {
  it("accepts readable passphrases with no symbols", () => {
    expect(validatePassword("purple gradschool coffee")).toBeNull();
    expect(validatePassword("maple-river-lantern-42")).toBeNull();
    expect(validatePassword("Cougar-Grad-Office-2026")).toBeNull();
  });

  it("rejects short passwords and reports the length", () => {
    expect(validatePassword("short pass")).toMatch(`at least ${PASSWORD_MIN_LENGTH}`);
    expect(validatePassword("")).toBe("Enter a password.");
    expect(validatePassword(undefined)).toBe("Enter a password.");
  });

  it("rejects overly long passwords", () => {
    expect(validatePassword("a-b-c-d-e-".repeat(20))).toMatch("at most");
  });

  it("rejects leading or trailing spaces", () => {
    expect(validatePassword(" purple gradschool coffee")).toMatch("space");
  });

  it("rejects common passwords padded to length", () => {
    expect(validatePassword("Password123456!")).toMatch("too common");
    expect(validatePassword("P@ssw0rd 2026 !!")).toMatch("too common");
    expect(validatePassword("wsugradschool2026")).toMatch("too common");
    expect(validatePassword("GoCougs!!2026")).toMatch("too common");
    expect(validatePassword("passwordpassword")).toMatch("too common");
  });

  it("rejects repetitive passwords", () => {
    expect(validatePassword("aaaaaaaaaaaaaa")).toMatch("repetitive");
    expect(validatePassword("abababababab")).toMatch("repetitive");
  });

  it("rejects passwords containing the email name", () => {
    expect(validatePassword("jsmith-office-2026", { email: "jsmith@wsu.edu" })).toMatch("email");
    expect(validatePassword("purple gradschool coffee", { email: "jsmith@wsu.edu" })).toBeNull();
  });

  it("rejects a password that is just the person's name", () => {
    expect(validatePassword("Jordanna2026!!", { fullName: "Jordanna Smith" })).toMatch("name");
  });
});

describe("generatePassphrase", () => {
  it("has 256 distinct words so each adds exactly 8 bits", () => {
    expect(PASSPHRASE_WORD_COUNT_FOR_TESTS).toBe(256);
  });

  it("produces passphrases that pass the policy", () => {
    for (let i = 0; i < 200; i += 1) {
      const phrase = generatePassphrase();
      expect(phrase).toMatch(/^[a-z]+(-[a-z]+){3}-\d{2}$/);
      expect(validatePassword(phrase)).toBeNull();
    }
  });
});

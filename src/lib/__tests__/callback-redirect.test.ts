/**
 * Tests for callback URL redirect hardening.
 *
 * The login page reads callbackUrl from search params and must only allow
 * internal paths to prevent open redirect attacks.
 */
import { describe, it, expect } from "vitest";

// Replicate the exact validation logic from login/page.tsx
function sanitizeCallbackUrl(raw: string | null): string {
  const value = raw || "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

describe("Callback URL sanitization", () => {
  it("allows normal internal paths", () => {
    expect(sanitizeCallbackUrl("/distributors")).toBe("/distributors");
    expect(sanitizeCallbackUrl("/records")).toBe("/records");
    expect(sanitizeCallbackUrl("/distributors/5")).toBe("/distributors/5");
    expect(sanitizeCallbackUrl("/")).toBe("/");
  });

  it("allows paths with query strings", () => {
    expect(sanitizeCallbackUrl("/records?status=active")).toBe("/records?status=active");
  });

  it("rejects absolute URLs (open redirect)", () => {
    expect(sanitizeCallbackUrl("https://evil.com")).toBe("/");
    expect(sanitizeCallbackUrl("http://evil.com")).toBe("/");
    expect(sanitizeCallbackUrl("https://evil.com/callback")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeCallbackUrl("//evil.com")).toBe("/");
    expect(sanitizeCallbackUrl("//evil.com/path")).toBe("/");
  });

  it("rejects javascript: URLs", () => {
    expect(sanitizeCallbackUrl("javascript:alert(1)")).toBe("/");
  });

  it("rejects data: URLs", () => {
    expect(sanitizeCallbackUrl("data:text/html,<script>alert(1)</script>")).toBe("/");
  });

  it("defaults to / when null", () => {
    expect(sanitizeCallbackUrl(null)).toBe("/");
  });

  it("defaults to / when empty string", () => {
    expect(sanitizeCallbackUrl("")).toBe("/");
  });
});

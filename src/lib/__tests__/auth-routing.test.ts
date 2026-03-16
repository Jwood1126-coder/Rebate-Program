/**
 * Tests for auth routing logic — verifying the middleware patterns
 * for API vs browser routes and the allow-list.
 */
import { describe, it, expect } from "vitest";

// Replicate middleware's route classification logic for unit testing
function classifyRoute(pathname: string, isAuthenticated: boolean) {
  // Allow-listed routes (no auth required)
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return "allow";
  }

  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return "json-401";
    }
    return "redirect-login";
  }

  return "allow";
}

describe("Auth routing classification", () => {
  describe("Unauthenticated requests", () => {
    it("API routes get JSON 401", () => {
      expect(classifyRoute("/api/records", false)).toBe("json-401");
      expect(classifyRoute("/api/records/5", false)).toBe("json-401");
      expect(classifyRoute("/api/distributors", false)).toBe("json-401");
      expect(classifyRoute("/api/audit", false)).toBe("json-401");
    });

    it("browser routes redirect to login", () => {
      expect(classifyRoute("/", false)).toBe("redirect-login");
      expect(classifyRoute("/distributors", false)).toBe("redirect-login");
      expect(classifyRoute("/records", false)).toBe("redirect-login");
      expect(classifyRoute("/audit", false)).toBe("redirect-login");
    });

    it("login page is always allowed", () => {
      expect(classifyRoute("/login", false)).toBe("allow");
      expect(classifyRoute("/login?callbackUrl=/records", false)).toBe("allow");
    });

    it("NextAuth API routes are always allowed", () => {
      expect(classifyRoute("/api/auth/session", false)).toBe("allow");
      expect(classifyRoute("/api/auth/callback/credentials", false)).toBe("allow");
    });

    it("static assets are always allowed", () => {
      expect(classifyRoute("/_next/static/chunk.js", false)).toBe("allow");
      expect(classifyRoute("/favicon.ico", false)).toBe("allow");
    });
  });

  describe("Authenticated requests", () => {
    it("all routes are allowed", () => {
      expect(classifyRoute("/", true)).toBe("allow");
      expect(classifyRoute("/api/records", true)).toBe("allow");
      expect(classifyRoute("/distributors/5", true)).toBe("allow");
    });
  });
});

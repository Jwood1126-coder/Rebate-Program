import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow auth-related routes and static assets
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Unauthenticated requests
  if (!req.auth) {
    // API routes get JSON 401, not a redirect to login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    // Browser routes redirect to login with callback
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|xlsx|csv)$).*)"],
};

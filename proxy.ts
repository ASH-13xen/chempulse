import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/auth";

/**
 * Password gate. Active only when SITE_PASSWORD is set (so local previews stay open).
 * The collector's refresh call (/api/revalidate) has its own secret.
 */
export async function proxy(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/login") || pathname.startsWith("/api/revalidate")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (token && safeEqual(token, await sessionToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|svg|ico|webp|jpg|txt)$).*)"],
};

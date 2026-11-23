import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.json({ ok: true });
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !safeEqual(body.password, password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: "That password is not right." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

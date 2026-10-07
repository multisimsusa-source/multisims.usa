import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

/**
 * Two jobs:
 * 1. Plan pages: answer withdrawn or unknown plan URLs with a real 404 status. The page
 *    itself streams under Partial Prerendering, so by the time it calls notFound() the
 *    200 status has already been sent (see Next docs, loading.js "Status codes").
 * 2. Portals: optimistic gate plus Supabase session refresh. Real authorisation happens
 *    in requireRole() and in Postgres RLS; this only avoids rendering a portal shell for
 *    someone with no session.
 */
export async function proxy(request: NextRequest) {
  const planSlug = request.nextUrl.pathname.match(/^\/plans\/([^/]+)\/?$/)?.[1]
  if (planSlug) return planGate(request, decodeURIComponent(planSlug))

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)

  if (!signedIn) {
    const url = request.nextUrl.clone()
    url.pathname = "/portal/login"
    url.search = ""
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return response
}

// Slugs recently allowed through. "Not live" is never remembered, so a newly published
// plan is never refused; a withdrawn one may render the streamed not-found page (noindex)
// for up to a minute before it gets the 404 status. A failed lookup is remembered too,
// so an unreachable database costs one round trip a minute, not one per request.
const liveSlugs = new Map<string, number>()
const LIVE_TTL_MS = 60_000

async function planGate(request: NextRequest, slug: string) {
  const seen = liveSlugs.get(slug)
  if (seen && seen > Date.now()) return NextResponse.next()

  const live = await planIsLive(slug)
  if (live === false) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 })
  }
  // live === null: lookup failed, let the page decide (soft 404 with noindex).
  if (liveSlugs.size > 500) liveSlugs.clear()
  liveSlugs.set(slug, Date.now() + LIVE_TTL_MS)
  return NextResponse.next()
}

async function planIsLive(slug: string): Promise<boolean | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/plan_is_live`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    return typeof data === "boolean" ? data : null
  } catch {
    return null
  }
}

export const config = {
  matcher: ["/plans/:slug", "/admin/:path*", "/agent/:path*", "/dealer/:path*"],
}

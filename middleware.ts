import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Auth callbacks never need a session check
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  // Create a mutable response so session cookie refreshes propagate to the browser
  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          }),
      },
    }
  )

  // getUser() validates the JWT and refreshes the session when needed
  const { data: { user } } = await supabase.auth.getUser()

  // Portal login/reset: pass through for unauthenticated users;
  // redirect authenticated users straight to the portal dashboard
  if (pathname === '/portal/login' || pathname === '/portal/reset-password') {
    if (user && pathname === '/portal/login') {
      return NextResponse.redirect(new URL('/portal/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Admin login: redirect authenticated users to admin dashboard
  if (pathname === '/login') {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Portal protected routes
  if (pathname.startsWith('/portal')) {
    if (!user) {
      return NextResponse.redirect(new URL('/portal/login', request.url))
    }
    return response
  }

  // All other protected routes redirect to the admin login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

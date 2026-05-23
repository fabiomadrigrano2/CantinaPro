import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import NavLinks from "./NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-cp-bg">
      <header className="sticky top-0 z-20 bg-cp-surface border-b border-cp-border">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-orange-500 rounded-md flex items-center justify-center text-sm shadow-md shadow-orange-500/30">
              🍽️
            </div>
            <span className="font-bold text-white text-sm tracking-tight hidden sm:block">
              CantinaPro
            </span>
          </div>

          <div className="w-px h-4 bg-cp-border shrink-0" />

          <NavLinks />

          <div className="ml-auto flex items-center gap-4 shrink-0">
            <span className="text-xs text-gray-500 hidden md:block truncate max-w-[180px]">
              {user?.email}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-red-400 transition font-medium"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-5 py-5 md:py-8">{children}</main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SideMenu } from "@/components/side-menu";
import type { MenuItem } from "@/components/side-menu";

const menuItems: MenuItem[] = [
  {
    id: "oracle",
    label: "Oracle",
    href: "/oracle",
    icon: "◉",
    children: [
      { id: "oracle-index", label: "Index Estimator", href: "/oracle/index-estimator", icon: "◈" },
    ],
  },
  { id: "mysql", label: "MySQL Tool", href: "/mysql", icon: "⊞" },
  { id: "sql-server", label: "SQL Server Tool", href: "/sql-server", icon: "◉" },
  { id: "postgres", label: "PostgreSQL Tool", href: "/postgres", icon: "◔" },
];

/** Figure out which menu item is active based on current URL path */
function getActiveId(): string | null {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (path.startsWith("/oracle/index-estimator")) return "oracle-index";
  if (path.startsWith("/oracle")) return "oracle";
  if (path.startsWith("/mysql")) return "mysql";
  if (path.startsWith("/sql-server")) return "sql-server";
  if (path.startsWith("/postgres")) return "postgres";
  return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Initialize from URL synchronously — avoids useEffect loops in StrictMode
  const [activeId, setActiveId] = useState<string | null>(getActiveId());

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="fixed z-50 border bg-card p-2 md:hidden"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
      >
        {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Mobile overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-screen w-[260px] border-r bg-card transition-transform duration-200 md:hidden",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SideMenu
          items={menuItems}
          activeItemId={activeId}
          onActiveChange={(id) => {
            setActiveId(id);
            setMenuOpen(false);
          }}
        />
      </aside>

      {/* Desktop sidebar + main content */}
      <div className="flex">
        <SideMenu
          items={menuItems}
          activeItemId={activeId}
          onActiveChange={setActiveId}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}

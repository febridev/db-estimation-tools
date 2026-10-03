"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface MenuItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  children?: MenuItem[];
}

export interface SideMenuProps {
  items: MenuItem[];
  activeItemId: string | null;
  onActiveChange: (id: string) => void;
}

function ChildItem({ item }: { item: MenuItem }) {
  return (
    <a
      href={item.href}
      className={cn(
        "block rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors",
        "hover:bg-muted/70",
        "text-muted-foreground",
      )}
    >
      {item.label}
    </a>
  );
}

function Section({
  item,
  activeItemId,
  onActiveChange,
}: {
  item: MenuItem;
  activeItemId: string | null;
  onActiveChange: (id: string) => void;
}) {
  const hasChildren = !!item.children?.length;
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-0.5">
      {hasChildren ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium",
            "transition-colors hover:bg-muted/70",
            item.id === activeItemId &&
            "border border-primary bg-primary/10 font-semibold",
          )}
        >
          <span className="shrink-0">{item.icon}</span>
          <span className="min-w-0 truncate">{item.label}</span>
          <span
            className="ml-auto flex-none text-xs transition-transform duration-200"
            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
          >
            →
          </span>
        </button>
      ) : (
        <a
          href={item.href}
          onClick={(e) => {
            e.preventDefault();
            onActiveChange(item.id);
          }}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium",
            "transition-colors hover:bg-muted/70",
            item.id === activeItemId &&
            "border border-primary bg-primary/10 font-semibold",
          )}
        >
          <span className="shrink-0">{item.icon}</span>
          <span className="min-w-0 truncate">{item.label}</span>
        </a>
      )}
      {hasChildren && expanded && (
        <div className="ml-4 space-y-0.5 border-l pl-2">
          {item.children!.map((child) => (
            <ChildItem key={child.id} item={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SideMenu({
  items,
  activeItemId,
  onActiveChange,
}: SideMenuProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r bg-card md:flex">
      <div className="border-b px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          DB Tools
        </h2>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-1">
          {items.map((item) => (
            <Section
              key={item.id}
              item={item}
              activeItemId={activeItemId}
              onActiveChange={onActiveChange}
            />
          ))}
        </div>
      </nav>
      <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">
        v0.1 Copyright (c) 2026 Author. All Rights Reserved.
      </div>
    </aside>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useScrollSpy } from "@/hooks/use-scroll-spy";
import { LANDING_BRAND } from "@/lib/landing-config";

const navLinks = [
  { href: "#hero", id: "hero", label: "首页" },
  { href: "#features", id: "features", label: "产品能力" },
  { href: "#use-cases", id: "use-cases", label: "使用场景" },
  { href: "#enterprise", id: "enterprise", label: "企业价值" },
  { href: "#how-it-works", id: "how-it-works", label: "如何开始" },
];

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeId = useScrollSpy();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center"
        >
          <Image
            src="/logo-prompthub.png"
            alt={LANDING_BRAND.name}
            width={140}
            height={40}
            className="h-8 w-auto sm:h-10 dark:invert dark:mix-blend-lighten"
            priority
            unoptimized
          />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`relative rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground ${
                activeId === link.id
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {link.label}
              {activeId === link.id && (
                <span className="absolute bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">菜单</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetHeader>
                <SheetTitle>导航</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground ${
                      activeId === link.id
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <Button size="sm" asChild className="h-9">
            <Link href="/login">进入控制台</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

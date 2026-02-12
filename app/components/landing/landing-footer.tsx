import Link from "next/link";
import { LANDING_BRAND } from "@/lib/landing-config";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 px-4 py-12 sm:px-6">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {LANDING_BRAND.name}. {LANDING_BRAND.tagline}
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              登录
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

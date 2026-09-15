import type { ReactNode } from "react";
import Link from "next/link";

type PublicActive =
  | "home"
  | "tech"
  | "stats"
  | "pitch"
  | "faq"
  | "security"
  | "privacy"
  | "terms"
  | "announcements"
  | "investors";

const publicNav: Array<{ href: string; label: string; active: PublicActive }> = [
  { href: "/tech", label: "Tech", active: "tech" },
  { href: "/stats", label: "Stats", active: "stats" },
  { href: "/pitch", label: "Pitch", active: "pitch" },
  { href: "/faq", label: "FAQ", active: "faq" },
  { href: "/security", label: "Security", active: "security" },
  { href: "/announcements", label: "Update", active: "announcements" },
  { href: "/investors", label: "Investitori", active: "investors" },
];

export function PublicPageShell({
  active,
  children,
}: {
  active: PublicActive;
  children: ReactNode;
}) {
  return (
    <div className="nds-public-dark nds-public-shell">
      <header className="nds-public-topbar">
        <div className="nds-public-topbar-inner">
          <Link href="/" className="nds-public-brand" aria-label="Nodosol home">
            <span className="nds-public-logo">n</span>
            <span>
              <span className="nds-public-name">nodosol</span>
              <span className="nds-public-tagline">regulated market OS</span>
            </span>
          </Link>

          <nav className="nds-public-nav" aria-label="Public pages">
            {publicNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={item.active === active ? "nds-public-nav-link is-active" : "nds-public-nav-link"}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link href="/marketplace" className="nds-public-market-cta">
            Enter market
          </Link>
        </div>
      </header>

      <main id="main-content" className="nds-public-main">
        {children}
      </main>
    </div>
  );
}

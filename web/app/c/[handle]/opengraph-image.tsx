// Per-handle Open Graph card. Next 14+ resolves this file convention
// automatically — the route is `https://nodosol.com/c/<handle>/opengraph-image`
// and Next wires `<meta property="og:image">` for the parent page.
//
// We use the built-in `next/og` runtime so no extra @vercel/og dep is
// needed. Image is regenerated on demand on Vercel's Edge runtime; CDN
// caches by URL so repeat hits are fast.

import { ImageResponse } from "next/og";

import { fetchProfileByHandle } from "@/lib/creatorProfile";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Nodosol creator profile";

export default async function CreatorOgImage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await fetchProfileByHandle(handle);

  const display = profile?.display_name?.trim() || (profile ? profile.handle : handle);
  const handleText = profile ? `@${profile.handle}` : `@${handle}`;
  const bio = (profile?.bio ?? "").slice(0, 180);
  const avatar = profile?.avatar_url ?? null;
  const banner = profile?.banner_url ?? null;
  const initials = display.replace(/^@/, "").slice(0, 2).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#0b0d12",
          color: "#eef0f3",
          position: "relative",
        }}
      >
        {banner ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              backgroundImage: `url(${banner})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.32,
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.22) 0%, rgba(139,92,246,0.10) 60%, rgba(11,13,18,0) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "44px 56px 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 22,
              }}
            >
              n
            </div>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>
              nodosol
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 18,
              color: "#a5b4fc",
              background: "rgba(123,156,255,0.14)",
              border: "1px solid rgba(123,156,255,0.32)",
              padding: "8px 14px",
              borderRadius: 999,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 4, background: "#6366f1" }} />
            Creator profile
          </div>
        </div>

        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            alignItems: "center",
            padding: "0 56px",
            gap: 36,
          }}
        >
          {avatar ? (
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: 100,
                display: "flex",
                backgroundImage: `url(${avatar})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                border: "4px solid #1f242d",
                boxShadow: "0 14px 36px rgba(0,0,0,0.4)",
              }}
            />
          ) : (
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 80,
                fontWeight: 700,
                color: "#a5b4fc",
                background: "linear-gradient(135deg, #1f242d 0%, #2a1f4a 100%)",
                border: "4px solid #1f242d",
              }}
            >
              {initials}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1.2,
                marginBottom: 6,
                color: "#eef0f3",
              }}
            >
              {display}
            </div>
            <div
              style={{
                fontSize: 26,
                color: "#a5b4fc",
                fontWeight: 500,
                marginBottom: 18,
              }}
            >
              {handleText}
            </div>
            {bio ? (
              <div
                style={{
                  fontSize: 24,
                  lineHeight: 1.4,
                  color: "#c5cbd4",
                  display: "flex",
                  maxWidth: 720,
                }}
              >
                {bio}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 56px 36px",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              color: "#7c8694",
              letterSpacing: 0.4,
            }}
          >
            Tip in USDC · Subscribe · Buy a ticket
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#a5b4fc",
              background: "rgba(123,156,255,0.10)",
              border: "1px solid rgba(123,156,255,0.28)",
              padding: "10px 18px",
              borderRadius: 12,
            }}
          >
            nodosol.com/c/{profile ? profile.handle : handle}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

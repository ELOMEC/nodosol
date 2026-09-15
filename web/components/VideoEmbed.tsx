"use client";

/**
 * Renders a URL as either a YouTube iframe, a Vimeo iframe, an HTML5
 * <video> (for direct mp4/webm/ogg links), or a plain link as fallback.
 * Extracted from AuctionDetailView so asset/rental/future detail pages
 * can share the same behaviour.
 */
export function VideoEmbed({ url, title = "Video" }: { url: string; title?: string }) {
  const yt = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  )?.[1];
  if (yt) {
    return (
      <div
        style={{
          position: "relative",
          paddingTop: "56.25%",
          borderRadius: 10,
          overflow: "hidden",
          background: "#111",
        }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${yt}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          title={title}
        />
      </div>
    );
  }
  const vimeo = url.match(/vimeo\.com\/(\d+)/)?.[1];
  if (vimeo) {
    return (
      <div
        style={{
          position: "relative",
          paddingTop: "56.25%",
          borderRadius: 10,
          overflow: "hidden",
          background: "#111",
        }}
      >
        <iframe
          src={`https://player.vimeo.com/video/${vimeo}`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          title={title}
        />
      </div>
    );
  }
  if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(url)) {
    return (
      <video
        controls
        src={url}
        style={{ width: "100%", borderRadius: 10, background: "#000" }}
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{ fontSize: "0.82rem", color: "#4338ca", textDecoration: "none", wordBreak: "break-all" }}
    >
      {url} ↗
    </a>
  );
}

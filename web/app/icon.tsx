import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          borderRadius: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        n
      </div>
    ),
    { ...size }
  );
}

export default function Loading() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#71717a" }}>
        <span
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid #2a2e36",
            borderTopColor: "#8b5cf6",
            animation: "nodosol-spin 0.8s linear infinite",
          }}
        />
        <span style={{ fontSize: "0.88rem", fontWeight: 500 }}>Loading…</span>
      </div>
      <style>{`
        @keyframes nodosol-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}

/**
 * @file index.tsx
 * AKARI Writer — MVP scaffold entry.
 *
 * This is a stub app used to validate Shell's app loading mechanism
 * (see akari-os/docs/planning/app-loading-mvp-2026-04-22.md).
 * The actual Writer UI will be migrated from akari-shell/src/modules/writer/
 * in the next iteration.
 */

export default function WriterApp() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        height: "100%",
        padding: "2rem",
        color: "var(--foreground)",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>AKARI Writer</h1>
      <p style={{ opacity: 0.7, textAlign: "center", maxWidth: "32rem" }}>
        Hello from Writer App — これは App Loading MVP の動作確認用スタブです。
        <br />
        実際の Writer UI は次のスプリントで{" "}
        <code>akari-shell/src/modules/writer/</code> から移植されます。
      </p>
      <pre
        style={{
          fontSize: "0.75rem",
          opacity: 0.5,
          marginTop: "2rem",
        }}
      >
        app.id = com.akari.writer
        <br />
        app.version = 0.1.0
        <br />
        panels.main.mount = src/index.tsx
      </pre>
    </div>
  );
}

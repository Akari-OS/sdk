/**
 * DeviceFrame — デバイスフレーム (iPhone 16 / MacBook) で子要素を囲む。
 *
 * AKARI Video の `DeviceFrame.tsx` から移植 & Shell 用にスリム化。
 * Phase 0 は phone / pc の 2 種類。
 */

import { Smartphone, Monitor } from "lucide-react";

export type DeviceType = "phone" | "pc";

const SPECS = {
  phone: {
    screenWidth: 393,
    screenHeight: 852,
    cornerRadius: 55,
    dynamicIslandWidth: 126,
    dynamicIslandHeight: 37,
    statusBarHeight: 54,
    homeIndicatorHeight: 34,
    bezelWidth: 4,
    scale: 0.52,
  },
  pc: {
    screenWidth: 1280,
    screenHeight: 800,
    titleBarHeight: 28,
    scale: 0.38,
  },
} as const;

export type FrameTheme = "dark" | "light";

interface DeviceFrameProps {
  device: DeviceType;
  children: React.ReactNode;
  /** スケール倍率 (1.0 = デフォルト値を使う、2.0 = デフォルトの 2 倍) */
  scaleFactor?: number;
  /** フレームのテーマ */
  theme?: FrameTheme;
}

export function DeviceFrame({ device, children, scaleFactor = 1.0, theme = "dark" }: DeviceFrameProps) {
  if (device === "pc") return <MacFrame scaleFactor={scaleFactor} theme={theme}>{children}</MacFrame>;
  return <PhoneFrame scaleFactor={scaleFactor} theme={theme}>{children}</PhoneFrame>;
}

const FRAME_COLORS = {
  dark: { bg: "#000", bezel: "#2c2c2e", status: "#fff", island: "#000", indicator: "rgba(255,255,255,0.3)" },
  light: { bg: "#f2f2f7", bezel: "#d1d1d6", status: "#000", island: "#000", indicator: "rgba(0,0,0,0.2)" },
} as const;

function PhoneFrame({ children, scaleFactor = 1.0, theme = "dark" }: { children: React.ReactNode; scaleFactor?: number; theme?: FrameTheme }) {
  const fc = FRAME_COLORS[theme];
  const s = SPECS.phone;
  const scale = s.scale * scaleFactor;
  const dw = (s.screenWidth + s.bezelWidth * 2) * scale;
  const dh = (s.screenHeight + s.bezelWidth * 2) * scale;
  const contentHeight = s.screenHeight - s.statusBarHeight - s.homeIndicatorHeight;

  return (
    <div className="flex flex-col items-center py-3">
      <div
        style={{
          width: dw,
          height: dh,
          borderRadius: (s.cornerRadius + s.bezelWidth) * scale,
          backgroundColor: fc.bg,
          boxShadow:
            "0 10px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* ベゼル */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: (s.cornerRadius + s.bezelWidth) * scale,
            border: `${s.bezelWidth * scale}px solid ${fc.bezel}`,
            pointerEvents: "none",
            zIndex: 2,
          }}
        />

        {/* Dynamic Island */}
        <div
          style={{
            position: "absolute",
            top: (s.bezelWidth + 12) * scale,
            left: "50%",
            transform: "translateX(-50%)",
            width: s.dynamicIslandWidth * scale,
            height: s.dynamicIslandHeight * scale,
            borderRadius: (s.dynamicIslandHeight / 2) * scale,
            backgroundColor: fc.island,
            zIndex: 3,
          }}
        />

        {/* ステータスバー */}
        <div
          style={{
            height: s.statusBarHeight * scale,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: `0 ${20 * scale}px ${4 * scale}px`,
            fontSize: 12 * scale,
            fontWeight: 600,
            color: fc.status,
          }}
        >
          <span>9:41</span>
          <span style={{ fontSize: 10 * scale, opacity: 0.7 }}>
            ▃▅▇ 5G 🔋
          </span>
        </div>

        {/* スクリーンコンテンツ */}
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: s.screenWidth,
            height: contentHeight,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {children}
        </div>

        {/* ホームインジケーター */}
        <div
          style={{
            position: "absolute",
            bottom: (s.bezelWidth + 8) * scale,
            left: "50%",
            transform: "translateX(-50%)",
            width: 134 * scale,
            height: 5 * scale,
            borderRadius: 2.5 * scale,
            backgroundColor: fc.indicator,
            zIndex: 3,
          }}
        />
      </div>
    </div>
  );
}

function MacFrame({ children, scaleFactor = 1.0, theme: _theme = "dark" }: { children: React.ReactNode; scaleFactor?: number; theme?: FrameTheme }) {
  const s = SPECS.pc;
  const scale = s.scale * scaleFactor;
  const screenW = s.screenWidth * scale;
  const screenH = s.screenHeight * scale;
  const titleH = s.titleBarHeight * scale;

  return (
    <div className="flex flex-col items-center py-3">
      <div
        style={{
          width: screenW,
          height: titleH + screenH,
          borderRadius: 8,
          backgroundColor: "#1c1c1e",
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        {/* タイトルバー */}
        <div
          style={{
            height: titleH,
            backgroundColor: "#2a2a2e",
            borderBottom: "1px solid #3a3a3c",
            display: "flex",
            alignItems: "center",
            paddingLeft: 8 * scale,
            gap: 4 * scale,
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span
              key={c}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: c,
                display: "inline-block",
              }}
            />
          ))}
        </div>

        {/* スクリーン — 固定高さのコンテナで transform のはみ出しを防ぐ */}
        <div style={{ width: screenW, height: screenH, overflow: "hidden" }}>
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: s.screenWidth,
              height: s.screenHeight,
              overflow: "hidden",
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Mac スタンド */}
      <div
        style={{
          width: screenW * 0.5,
          height: 4,
          backgroundColor: "#2c2c2e",
          borderRadius: "0 0 4px 4px",
          margin: "0 auto",
        }}
      />
    </div>
  );
}

export function DeviceSelector({
  device,
  onChange,
}: {
  device: DeviceType;
  onChange: (d: DeviceType) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-background">
      <button
        onClick={() => onChange("phone")}
        className={`px-2 py-0.5 rounded transition flex items-center justify-center ${
          device === "phone"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Smartphone size={12} />
      </button>
      <button
        onClick={() => onChange("pc")}
        className={`px-2 py-0.5 rounded transition flex items-center justify-center ${
          device === "pc"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Monitor size={12} />
      </button>
    </div>
  );
}

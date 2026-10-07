import { ImageResponse } from "next/og"

export const alt = "MultiSims USA: US SIM cards and eSIMs"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#f6f5fa",
          color: "#2a1a2c",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: 6, color: "#36093a", fontFamily: "serif" }}>MSU</span>
          <span style={{ fontSize: 16, letterSpacing: 8, color: "#a07a5a" }}>MULTISIMS.USA</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, maxWidth: 900 }}>
            US SIM cards and eSIMs, ready before you land.
          </div>
          <div style={{ fontSize: 30, color: "#6b6170" }}>
            T-Mobile, Verizon, AT&T and more. Choose your days, pay, connect.
          </div>
        </div>
      </div>
    ),
    size
  )
}

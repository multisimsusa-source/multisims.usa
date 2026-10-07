import { ImageResponse } from "next/og"

export const size = { width: 64, height: 64 }
export const contentType = "image/png"

/** Plum tile with the MSU monogram. Replace with the client's vector mark when supplied. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#36093a",
          borderRadius: 14,
          color: "#ffffff",
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: 1,
          fontFamily: "serif",
        }}
      >
        MSU
      </div>
    ),
    size
  )
}

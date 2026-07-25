import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#a60f2d",
          color: "#fff",
          display: "flex",
          fontSize: 14,
          fontWeight: 700,
          height: "100%",
          justifyContent: "center",
          letterSpacing: "-0.04em",
          width: "100%",
        }}
      >
        KB
      </div>
    ),
    { ...size },
  );
}

import { ImageResponse } from "next/og";

/* Favicon — the orange field-guide pin on parchment. The site shipped
   with no favicon at all; this is the smallest deterministic brand mark. */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

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
          background: "#F6F1E6",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50% 50% 50% 0",
            background: "#D9481F",
            transform: "rotate(-45deg)",
            marginTop: -2,
          }}
        />
      </div>
    ),
    size
  );
}

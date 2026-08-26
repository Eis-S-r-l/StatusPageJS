import { describe, expect, it } from "vitest";

import { detectImage } from "./assets";

describe("detectImage", () => {
  it("detects supported image signatures without trusting a filename", () => {
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ extension: "png", mimeType: "image/png" });
    expect(detectImage(Buffer.from([0x00, 0x00, 0x01, 0x00]))).toEqual({ extension: "ico", mimeType: "image/x-icon" });
  });

  it("rejects arbitrary and SVG-like content", () => {
    expect(detectImage(Buffer.from("<svg><script /></svg>"))).toBeNull();
    expect(detectImage(Buffer.from("not an image"))).toBeNull();
  });
});

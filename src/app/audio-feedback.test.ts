import { describe, expect, it } from "vitest";

import { createFeedbackWavBytes } from "./audio-feedback.js";

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

describe("audio feedback", () => {
  it("creates a valid mono PCM wav payload", () => {
    const bytes = createFeedbackWavBytes(440, 0.1, 8000);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(ascii(bytes, 8, 4)).toBe("WAVE");
    expect(ascii(bytes, 12, 4)).toBe("fmt ");
    expect(ascii(bytes, 36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(bytes.byteLength).toBe(44 + 800 * 2);
  });
});

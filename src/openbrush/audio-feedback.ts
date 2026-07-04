const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

export function createFeedbackWavBytes(
  frequency = 660,
  durationSeconds = 0.08,
  sampleRate = 22050,
): Uint8Array {
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + sampleCount * BYTES_PER_SAMPLE);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * BYTES_PER_SAMPLE, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * BYTES_PER_SAMPLE, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = 1 - index / sampleCount;
    const sample =
      Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * envelope;
    view.setInt16(
      WAV_HEADER_BYTES + index * BYTES_PER_SAMPLE,
      sample * 0x7fff,
      true,
    );
  }

  return new Uint8Array(buffer);
}

export function createFeedbackWavUrl(): string {
  const bytes = createFeedbackWavBytes();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return URL.createObjectURL(
    new Blob([buffer], { type: "audio/wav" }),
  );
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

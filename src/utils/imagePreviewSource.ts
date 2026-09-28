// Remove EXIF only from a temporary preview Blob. No pixels are cropped or
// re-encoded, and the original File is still sent byte-for-byte to the backend.
// This makes browser orientation match Sharp's raw decode (no auto-orientation).
export async function imagePreviewSource(file: File, mimeType: string): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const removed: Array<[number, number]> = [];
  const text = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const start = offset;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break; // Keep the compressed scan intact.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker === 0xe1 && text(offset + 2, 6) === "Exif\0\0") removed.push([start, offset + length]);
      offset += length;
    }
  } else if (mimeType === "image/png") {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const end = offset + 12 + view.getUint32(offset);
      if (end > bytes.length) break;
      if (text(offset + 4, 4) === "eXIf") removed.push([offset, end]);
      offset = end; // Removing an entire chunk also removes its CRC.
    }
  } else if (mimeType === "image/webp") {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const length = view.getUint32(offset + 4, true);
      const end = offset + 8 + length + (length % 2);
      if (end > bytes.length) break;
      if (text(offset, 4) === "EXIF") removed.push([offset, end]);
      offset = end;
    }
  }
  if (!removed.length) return file;

  const output = new Uint8Array(bytes.length - removed.reduce((sum, [start, end]) => sum + end - start, 0));
  let read = 0;
  let write = 0;
  for (const [start, end] of removed) {
    output.set(bytes.subarray(read, start), write);
    write += start - read;
    read = end;
  }
  output.set(bytes.subarray(read), write);
  if (mimeType === "image/webp") {
    const outputView = new DataView(output.buffer);
    outputView.setUint32(4, output.length - 8, true);
    for (let offset = 12; offset + 8 <= output.length;) {
      const length = outputView.getUint32(offset + 4, true);
      if (String.fromCharCode(...output.subarray(offset, offset + 4)) === "VP8X" && length >= 1) output[offset + 8] &= ~0x08;
      offset += 8 + length + (length % 2);
    }
  }
  return new Blob([output], { type: mimeType });
}

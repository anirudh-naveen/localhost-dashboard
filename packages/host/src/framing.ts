/**
 * Chrome Native Messaging framing: each message is a 32-bit length in native
 * byte order (little-endian on every platform Chrome ships on) followed by UTF-8 JSON.
 */

/** Chrome rejects host → browser messages over 1 MB. */
export const MAX_OUTGOING = 1024 * 1024;

export function encode(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  if (body.length > MAX_OUTGOING) throw new Error(`message too large (${body.length} bytes)`);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export class FrameDecoder {
  private buf = Buffer.alloc(0);

  /** Feed a chunk from stdin; returns every complete message it finished. */
  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: unknown[] = [];
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32LE(0);
      if (this.buf.length < 4 + len) break;
      out.push(JSON.parse(this.buf.subarray(4, 4 + len).toString("utf8")));
      this.buf = this.buf.subarray(4 + len);
    }
    return out;
  }
}

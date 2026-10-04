import { describe, expect, it } from "vitest";
import { encode, FrameDecoder } from "../src/framing.js";

describe("framing", () => {
  it("round-trips messages", () => {
    const d = new FrameDecoder();
    expect(d.push(encode({ id: 1, type: "ping" }))).toEqual([{ id: 1, type: "ping" }]);
  });

  it("handles messages split across and packed into chunks", () => {
    const d = new FrameDecoder();
    const both = Buffer.concat([encode({ a: "é" }), encode({ b: 2 })]);
    expect(d.push(both.subarray(0, 3))).toEqual([]);
    expect(d.push(both.subarray(3, 9))).toEqual([]);
    expect(d.push(both.subarray(9))).toEqual([{ a: "é" }, { b: 2 }]);
  });

  it("writes a little-endian byte length", () => {
    const buf = encode({ x: "é" });
    expect(buf.readUInt32LE(0)).toBe(Buffer.byteLength('{"x":"é"}'));
  });
});

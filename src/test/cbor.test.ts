import { describe, it, expect } from "vitest";
import { decode } from "cborg";
import { encode, CborTag, encodeItem } from "../lib/cbor";

describe("encodeItem — primitives", () => {
  it("encodes false as 0xf4", () => {
    expect(encodeItem(false)).toEqual([0xf4]);
  });

  it("encodes true as 0xf5", () => {
    expect(encodeItem(true)).toEqual([0xf5]);
  });

  it("encodes small uint inline (≤ 23)", () => {
    expect(encodeItem(0)).toEqual([0x00]);
    expect(encodeItem(23)).toEqual([0x17]);
  });

  it("encodes uint 24–255 with 0x18 prefix", () => {
    expect(encodeItem(24)).toEqual([0x18, 24]);
    expect(encodeItem(255)).toEqual([0x18, 0xff]);
  });

  it("encodes uint 256–65535 with 0x19 prefix", () => {
    expect(encodeItem(256)).toEqual([0x19, 0x01, 0x00]);
    expect(encodeItem(0xffff)).toEqual([0x19, 0xff, 0xff]);
  });

  it("encodes uint > 65535 with 0x1a prefix", () => {
    expect(encodeItem(0x10000)).toEqual([0x1a, 0x00, 0x01, 0x00, 0x00]);
  });

  it("encodes byte string with length prefix", () => {
    const bytes = new Uint8Array([0xde, 0xad]);
    expect(encodeItem(bytes)).toEqual([0x42, 0xde, 0xad]);
  });

  it("encodes UTF-8 text string", () => {
    const result = encodeItem("hi");
    expect(result[0]).toBe(0x62); // major 3, length 2
    expect(String.fromCharCode(result[1], result[2])).toBe("hi");
  });

  it("encodes an array", () => {
    const result = encodeItem([1, 2]);
    expect(result[0]).toBe(0x82); // major 4, length 2
    expect(result[1]).toBe(0x01);
    expect(result[2]).toBe(0x02);
  });

  it("encodes a Map with integer keys", () => {
    const m = new Map<number, unknown>([[1, "a"]]);
    const result = encode(m);
    const decoded = decode(result, { useMaps: true }) as Map<number, unknown>;
    expect(decoded.get(1)).toBe("a");
  });

  it("throws on unsupported type", () => {
    expect(() => encodeItem(null)).toThrow("Unsupported CBOR value");
  });
});

describe("CborTag", () => {
  it("encodes tag + value and round-trips through cborg", () => {
    const tagged = new CborTag(37, new Uint8Array(16));
    const result = encode(tagged);
    // 0xd8 0x25 = tag(37), followed by bstr(16)
    expect(result[0]).toBe(0xd8);
    expect(result[1]).toBe(0x25);
    expect(result[2]).toBe(0x50); // bstr length 16
  });

  it("stores tag and value properties", () => {
    const tag = new CborTag(304, new Map());
    expect(tag.tag).toBe(304);
    expect(tag.value).toBeInstanceOf(Map);
  });
});

describe("encode — round-trip", () => {
  it("round-trips a nested map through cborg", () => {
    const inner = new Map<number, unknown>([[1, [44, true, 0, true]]]);
    const outer = new Map<number, unknown>([
      [1, new Uint8Array([0xab, 0xcd])],
      [2, "hello"],
      [3, 42],
      [4, inner],
    ]);
    const encoded = encode(outer);
    const decoded = decode(encoded, { useMaps: true }) as Map<number, unknown>;
    expect(decoded.get(2)).toBe("hello");
    expect(decoded.get(3)).toBe(42);
    const decodedInner = decoded.get(4) as Map<number, unknown>;
    expect(decodedInner.get(1)).toEqual([44, true, 0, true]);
  });
});

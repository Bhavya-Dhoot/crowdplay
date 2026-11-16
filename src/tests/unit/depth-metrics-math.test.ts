import { describe, expect, it } from "vitest";
import { csvCell, median, percentile, toCsv } from "@/lib/metrics";

describe("median", () => {
  it("returns null for no data", () => {
    expect(median([])).toBeNull();
  });
  it("takes the middle value of an odd count and does not mutate the input", () => {
    const xs = [900, 100, 500];
    expect(median(xs)).toBe(500);
    expect(xs).toEqual([900, 100, 500]);
  });
  it("averages the two middle values of an even count", () => {
    expect(median([1000, 4000, 2000, 3000])).toBe(2500);
    expect(median([1, 2])).toBe(2); // 1.5 rounds to the nearest integer millisecond
  });
  it("handles a single value", () => {
    expect(median([1234])).toBe(1234);
  });
});

describe("percentile (nearest rank)", () => {
  it("returns null for no data", () => {
    expect(percentile([], 95)).toBeNull();
  });
  it("is the smallest value with at least p% of the data at or below it", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);
    expect(percentile(hundred, 95)).toBe(950);
    expect(percentile(hundred, 50)).toBe(500);
    expect(percentile(hundred, 100)).toBe(1000);
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(twenty, 95)).toBe(19);
  });
  it("never understates a small sample: p95 of three rounds is the slowest one", () => {
    expect(percentile([100, 200, 3000], 95)).toBe(3000);
  });
  it("is order independent and clamps p to the data", () => {
    expect(percentile([5, 1, 3], 95)).toBe(5);
    expect(percentile([5, 1, 3], 0)).toBe(1);
    expect(percentile([7], 95)).toBe(7);
  });
});

describe("CSV escaping", () => {
  it("leaves plain text and numbers alone and renders null as empty", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes commas, quotes and line breaks and doubles inner quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("cr\rhere")).toBe('"cr\rhere"'); // a lone CR is quoted
  });
  it("defuses text a spreadsheet would run as a formula", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    // real numbers (including negatives) are not text and stay numeric
    expect(csvCell(-2)).toBe("-2");
  });
  it("builds a header plus one CRLF-terminated line per row", () => {
    const csv = toCsv([{ a: "x,y", b: 2 }, { a: 'q"', b: null }], ["a", "b"]);
    expect(csv).toBe('a,b\r\n"x,y",2\r\n"q""",\r\n');
  });
});

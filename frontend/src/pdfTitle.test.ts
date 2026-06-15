import { describe, expect, it } from "vitest";
import { inferBookTitleFromPdfName } from "./pdfTitle";

describe("inferBookTitleFromPdfName", () => {
  it("infers a clean Chinese book title from a downloaded PDF filename", () => {
    expect(
      inferBookTitleFromPdfName(
        "蛤蟆先生去看心理医生 (（英）罗伯特•戴博德) (z-library.sk, 1lib.sk, z-lib.sk).pdf",
      ),
    ).toBe("蛤蟆先生去看心理医生");
  });
});

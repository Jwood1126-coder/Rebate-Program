import { describe, it, expect } from "vitest";
import { validateFileForStorage, MAX_FILE_SIZE_BYTES, ALLOWED_FILE_EXTENSIONS } from "@/lib/constants/file-limits";

describe("validateFileForStorage", () => {
  it("accepts valid xlsx file under size limit", () => {
    expect(validateFileForStorage("contract.xlsx", 1024)).toBeNull();
  });

  it("accepts valid csv file", () => {
    expect(validateFileForStorage("data.csv", 5000)).toBeNull();
  });

  it("accepts valid pdf file", () => {
    expect(validateFileForStorage("agreement.pdf", 2 * 1024 * 1024)).toBeNull();
  });

  it("rejects file over 10MB", () => {
    const result = validateFileForStorage("huge.xlsx", 11 * 1024 * 1024);
    expect(result).toContain("too large");
    expect(result).toContain("10MB");
  });

  it("rejects exactly at boundary + 1 byte", () => {
    expect(validateFileForStorage("file.xlsx", MAX_FILE_SIZE_BYTES + 1)).not.toBeNull();
  });

  it("accepts exactly at 10MB boundary", () => {
    expect(validateFileForStorage("file.xlsx", MAX_FILE_SIZE_BYTES)).toBeNull();
  });

  it("rejects disallowed extension .exe", () => {
    const result = validateFileForStorage("malware.exe", 1024);
    expect(result).toContain(".exe");
    expect(result).toContain("not allowed");
  });

  it("rejects disallowed extension .zip", () => {
    expect(validateFileForStorage("archive.zip", 1024)).not.toBeNull();
  });

  it("rejects disallowed extension .js", () => {
    expect(validateFileForStorage("script.js", 1024)).not.toBeNull();
  });

  it("accepts all declared allowed extensions", () => {
    for (const ext of ALLOWED_FILE_EXTENSIONS) {
      expect(validateFileForStorage(`file.${ext}`, 1024)).toBeNull();
    }
  });

  it("handles file with no extension", () => {
    expect(validateFileForStorage("noextension", 1024)).not.toBeNull();
  });

  it("handles empty filename", () => {
    expect(validateFileForStorage("", 1024)).not.toBeNull();
  });
});

/**
 * Shared file upload guardrails — used by manual uploads and auto-archival paths.
 * Keeps the DB-safety policy consistent everywhere files are stored.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_EXTENSIONS = ["xlsx", "xls", "csv", "pdf", "doc", "docx"];

/**
 * Validate a file against the shared guardrails.
 * Returns an error string if invalid, null if OK.
 */
export function validateFileForStorage(fileName: string, fileSize: number): string | null {
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return `File too large (${(fileSize / (1024 * 1024)).toFixed(1)}MB). Maximum: 10MB.`;
  }
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    return `File type ".${ext}" not allowed. Accepted: ${ALLOWED_FILE_EXTENSIONS.join(", ")}.`;
  }
  return null;
}

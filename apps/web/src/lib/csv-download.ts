const FALLBACK_EXPORT_NAME = "payscope-employees.csv";
const SAFE_CSV_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.csv$/i;

export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1]);
    } catch {
      return null;
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

export function safeDownloadFilename(value: string | null | undefined): string {
  if (!value) return FALLBACK_EXPORT_NAME;
  const base = value.replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  return SAFE_CSV_NAME.test(base) ? base : FALLBACK_EXPORT_NAME;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeDownloadFilename(filename);
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kib = bytes / 1024;
    return `${kib.toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MAX_CSV_UPLOAD_BYTES = 2 * 1024 * 1024;

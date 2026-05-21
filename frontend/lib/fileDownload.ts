import { api } from "./api";

export const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const downloadFromApi = async (
  url: string,
  filename: string,
  params?: Record<string, string | number | undefined>
): Promise<void> => {
  const response = await api.get(url, { responseType: "blob", params });
  const blob = new Blob([response.data]);
  triggerBlobDownload(blob, filename);
};

export const downloadCsv = (
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void => {
  const csvRows = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csvRows], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, filename);
};

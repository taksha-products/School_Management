import * as XLSX from "xlsx";

export interface ParseResult<T> {
  rows: T[];
  errors: { row: number; message: string }[];
  totalRows: number;
  validRows: number;
}

export interface TemplateHeader {
  key: string;
  header: string;
  example: string;
}

// Generic Excel/CSV parser using caller-provided row validation.
export const parseExcelBuffer = <T>(
  buffer: Buffer,
  validator: (row: Record<string, unknown>, rowIndex: number) => T
): ParseResult<T> => {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false
  }) as Record<string, unknown>[];

  const rows: T[] = [];
  const errors: { row: number; message: string }[] = [];

  rawRows.forEach((raw, index) => {
    try {
      const parsed = validator(raw, index + 2);
      rows.push(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid row";
      errors.push({ row: index + 2, message });
    }
  });

  return {
    rows,
    errors,
    totalRows: rawRows.length,
    validRows: rows.length
  };
};

// Generates a template or export workbook as xlsx buffer.
export const generateTemplate = (
  headers: TemplateHeader[],
  sheetName: string,
  dataRows?: Record<string, unknown>[],
  orgName?: string
): Buffer => {
  const sheetData =
    dataRows && dataRows.length > 0
      ? dataRows.map((row) =>
          headers.reduce<Record<string, unknown>>((acc, header) => {
            acc[header.header] = row[header.key] ?? "";
            return acc;
          }, {})
        )
      : [
          headers.reduce<Record<string, unknown>>((acc, header) => {
            acc[header.header] = header.example;
            return acc;
          }, {})
        ];

  const worksheet = XLSX.utils.json_to_sheet(sheetData, {
    header: headers.map((h) => h.header)
  });

  worksheet["!cols"] = headers.map(() => ({ wch: 20 }));

  if (orgName) {
    XLSX.utils.sheet_add_aoa(worksheet, [[orgName]], { origin: "A1" });
    XLSX.utils.sheet_add_aoa(worksheet, [headers.map((h) => h.header)], { origin: "A2" });
    XLSX.utils.sheet_add_json(worksheet, sheetData, {
      origin: "A3",
      skipHeader: true
    });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
};

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTemplate = exports.parseExcelBuffer = void 0;
const XLSX = __importStar(require("xlsx"));
// Generic Excel/CSV parser using caller-provided row validation.
const parseExcelBuffer = (buffer, validator) => {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false
    });
    const rows = [];
    const errors = [];
    rawRows.forEach((raw, index) => {
        try {
            const parsed = validator(raw, index + 2);
            rows.push(parsed);
        }
        catch (error) {
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
exports.parseExcelBuffer = parseExcelBuffer;
// Generates a template or export workbook as xlsx buffer.
const generateTemplate = (headers, sheetName, dataRows, orgName) => {
    const sheetData = dataRows && dataRows.length > 0
        ? dataRows.map((row) => headers.reduce((acc, header) => {
            acc[header.header] = row[header.key] ?? "";
            return acc;
        }, {}))
        : [
            headers.reduce((acc, header) => {
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
exports.generateTemplate = generateTemplate;

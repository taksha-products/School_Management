import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import { RECEIPT_PDF_WIDTH_PX } from "@/lib/receiptFormat";

/** CSS px → mm (96dpi) */
const CSS_PX_TO_MM = 25.4 / 96;

const cropCanvasToTargetWidth = (
  source: HTMLCanvasElement,
  targetCssWidth: number,
  scale: number
): HTMLCanvasElement => {
  const targetWidthPx = Math.round(targetCssWidth * scale);
  if (source.width <= targetWidthPx) {
    return source;
  }

  const cropped = document.createElement("canvas");
  cropped.width = targetWidthPx;
  cropped.height = source.height;
  const ctx = cropped.getContext("2d");
  if (!ctx) {
    return source;
  }
  ctx.drawImage(source, 0, 0, targetWidthPx, source.height, 0, 0, targetWidthPx, source.height);
  return cropped;
};

const measureElementSize = (element: HTMLElement): { widthPx: number; heightPx: number } => {
  const heightPx = Math.ceil(
    Math.max(element.scrollHeight, element.offsetHeight, element.getBoundingClientRect().height) +
      16
  );
  return { widthPx: RECEIPT_PDF_WIDTH_PX, heightPx };
};

/** Single-page PDF sized to the full receipt capture. */
export const downloadReceiptPdf = async (
  element: HTMLElement,
  filename: string
): Promise<void> => {
  const { widthPx, heightPx } = measureElementSize(element);
  const scale = 2;

  const rawCanvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    width: widthPx,
    height: heightPx,
    windowWidth: widthPx,
    windowHeight: heightPx,
    scrollX: 0,
    scrollY: -window.scrollY,
    backgroundColor: "#ffffff",
    onclone: (clonedDoc) => {
      const cloned = clonedDoc.querySelector(".fee-receipt-pdf-capture");
      if (!(cloned instanceof HTMLElement)) {
        return;
      }
      cloned.style.width = `${widthPx}px`;
      cloned.style.maxWidth = `${widthPx}px`;
      cloned.style.margin = "0";
      cloned.style.boxShadow = "none";
      cloned.style.outline = "none";
    }
  });

  const canvas = cropCanvasToTargetWidth(rawCanvas, widthPx, scale);
  const widthMm = widthPx * CSS_PX_TO_MM;
  const contentHeightMm = (canvas.height / scale) * CSS_PX_TO_MM;
  const pageHeightMm = contentHeightMm + 4;

  const imgData = canvas.toDataURL("image/jpeg", 0.93);
  const pdf = new jsPDF({
    unit: "mm",
    format: [widthMm, pageHeightMm],
    orientation: "portrait",
    compress: true
  });

  pdf.addImage(imgData, "JPEG", 0, 0, widthMm, contentHeightMm, undefined, "FAST");
  pdf.save(filename);
};

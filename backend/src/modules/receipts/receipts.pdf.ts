import PdfPrinter from "pdfmake";
import fs from "fs";
import path from "path";
import { config } from "../../config";
import { getCompanySettings } from "../company/company.repository";
import { orders } from "../orders/orders.projections";

const fonts = {
  Courier: {
    normal: "Courier",
    bold: "Courier-Bold",
  },
};

const printer = new PdfPrinter(fonts);

function pickupPageContent(
  companySettings: { name: string; address: string; city: string; vatId: string },
  item: { name: string; qty: number },
  pickupNum: number,
  orderId: string,
  now: string
) {
  return [
    { text: companySettings.name, style: "header", alignment: "center" },
    { text: companySettings.address, alignment: "center", fontSize: 8 },
    { text: companySettings.city, alignment: "center", fontSize: 8 },
    { text: `USt-ID: ${companySettings.vatId}`, alignment: "center", fontSize: 8 },
    { text: "─".repeat(20), alignment: "center", margin: [0, 4] },
    { text: `Pickup #${pickupNum}`, style: "subheader", alignment: "center" },
    { text: "", margin: [0, 4] },
    { text: `${item.qty}× ${item.name}`, alignment: "center", fontSize: 12 },
    { text: "", margin: [0, 4] },
    { text: now, alignment: "center", fontSize: 8 },
    { text: `Order #${orderId.slice(0, 8)}`, alignment: "center", fontSize: 8 },
  ];
}

function finalPageContent(
  companySettings: { name: string; address: string; city: string; vatId: string },
  order: { id: string; terminalId: string; items: { name: string; qty: number; total: number }[]; totalGross: number; totalVat: Record<number, number> },
  now: string
) {
  const itemLines = order.items.map(
    (i) => ({
      columns: [
        { text: `${i.qty}× ${i.name}`, width: "auto" },
        { text: `${i.total.toFixed(2)}€`, alignment: "right", width: "*" },
      ],
      fontSize: 8,
      margin: [0, 1],
    })
  );

  const vatLines = Object.entries(order.totalVat).map(
    ([rate, amount]) => ({
      columns: [
        { text: `VAT ${rate}%:`, width: "auto" },
        { text: `${(amount as number).toFixed(2)}€`, alignment: "right", width: "*" },
      ],
      fontSize: 8,
      margin: [0, 1],
    })
  );

  return [
    { text: companySettings.name, style: "header", alignment: "center" },
    { text: companySettings.address, alignment: "center", fontSize: 8 },
    { text: companySettings.city, alignment: "center", fontSize: 8 },
    { text: `USt-ID: ${companySettings.vatId}`, alignment: "center", fontSize: 8 },
    { text: "─".repeat(20), alignment: "center", margin: [0, 4] },
    { text: "Final Receipt", style: "subheader", alignment: "center" },
    { text: "", margin: [0, 2] },
    ...itemLines,
    { text: "─".repeat(20), alignment: "center", margin: [0, 4] },
    ...vatLines,
    { text: "─".repeat(20), alignment: "center", margin: [0, 4] },
    {
      columns: [
        { text: "Total:", bold: true, width: "auto" },
        { text: `${order.totalGross.toFixed(2)} €`, bold: true, alignment: "right", width: "*" },
      ],
      fontSize: 10,
      margin: [0, 2],
    },
    { text: "", margin: [0, 4] },
    { text: `Order #${order.id.slice(0, 8)} · ${order.terminalId}`, alignment: "center", fontSize: 8 },
    { text: now, alignment: "center", fontSize: 8 },
  ];
}

export async function generateCombinedReceiptPdf(
  orderId: string
): Promise<string> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const companySettings = await getCompanySettings();
  const now = new Date().toLocaleString("de-DE");

  // Build pages: final receipt first, then pickup receipt per item
  const finalStack = finalPageContent(companySettings, order, now);
  const content: any[] = [{ stack: finalStack }];

  order.items.forEach((item, i) => {
    const pickupStack = pickupPageContent(companySettings, item, i + 1, orderId, now);
    content.push({ stack: pickupStack, pageBreak: "before" });
  });

  const doc = printer.createPdfKitDocument({
    pageSize: { width: 200, height: 200 },
    pageMargins: [10, 10, 10, 10],
    content,
    styles: {
      header: { fontSize: 10, bold: true },
      subheader: { fontSize: 10, bold: true },
    },
    defaultStyle: { font: "Courier" },
  });

  const dir = path.join(config.receiptPdfDir, "combined");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${orderId}.pdf`);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

export async function generatePickupReceiptPdf(
  orderId: string,
  itemId: string,
  pickupSeq: number
): Promise<string> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const companySettings = await getCompanySettings();

  const item = order.items.find((i) => i.itemId === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in order`);

  const now = new Date().toLocaleString("de-DE");

  const doc = printer.createPdfKitDocument({
    pageSize: { width: 200, height: 200 },
    pageMargins: [10, 10, 10, 10],
    content: pickupPageContent(companySettings, item, pickupSeq, orderId, now),
    styles: {
      header: { fontSize: 10, bold: true },
      subheader: { fontSize: 10, bold: true },
    },
    defaultStyle: { font: "Courier" },
  });

  const dir = path.join(config.receiptPdfDir, "pickup");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${orderId}-${itemId}.pdf`);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

export async function generateFinalReceiptPdf(
  orderId: string
): Promise<string> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const companySettings = await getCompanySettings();

  const now = new Date().toLocaleString("de-DE");

  const doc = printer.createPdfKitDocument({
    pageSize: { width: 200, height: 400 },
    pageMargins: [10, 10, 10, 10],
    content: finalPageContent(companySettings, order, now),
    styles: {
      header: { fontSize: 10, bold: true },
      subheader: { fontSize: 10, bold: true },
    },
    defaultStyle: { font: "Courier" },
  });

  const dir = path.join(config.receiptPdfDir, "final");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${orderId}.pdf`);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

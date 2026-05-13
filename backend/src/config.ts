export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  pg: {
    connectionString:
      process.env.DATABASE_URL || "postgresql://pos:pos@localhost:5432/pos",
  },
  receiptPdfDir:
    process.env.RECEIPT_PDF_DIR || "./data/receipts",
  adminPin: process.env.ADMIN_PIN || "0000",
};

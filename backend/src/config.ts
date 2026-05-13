export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  esdb: {
    connectionString:
      process.env.ESDB_CONNECTION || "esdb://localhost:2113?tls=false",
  },
  receiptPdfDir:
    process.env.RECEIPT_PDF_DIR || "./data/receipts",
};

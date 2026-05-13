declare module "pdfmake" {
  interface TFontDictionary {
    [fontName: string]: {
      normal?: string;
      bold?: string;
      italics?: string;
      bolditalics?: string;
    };
  }

  interface TDocumentDefinitions {
    pageSize?: { width: number; height: number } | string;
    pageMargins?: [number, number, number, number] | number;
    content: unknown[];
    styles?: Record<string, unknown>;
    defaultStyle?: { font?: string; fontSize?: number; [key: string]: unknown };
    [key: string]: unknown;
  }

  class PdfPrinter {
    constructor(fonts: TFontDictionary);
    createPdfKitDocument(
      docDefinition: TDocumentDefinitions
    ): NodeJS.ReadWriteStream;
    [key: string]: unknown;
  }

  export = PdfPrinter;
}

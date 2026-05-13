import { useState } from "react";

interface PrinterDevice {
  vendorId: number;
  productId: number;
}

export function usePrinter(_device?: PrinterDevice) {
  const [connected] = useState(false);

  return { connected, printPickup: undefined as unknown as () => Promise<void> };
}

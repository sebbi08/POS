export default class WebUSBPrinterStub {
  addEventListener(_event: string, _fn: () => void) {}
  connect() {}
  print(_data: Uint8Array) {}
  disconnect() {}
}

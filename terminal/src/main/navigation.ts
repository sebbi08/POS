/**
 * The window may only show the app itself: the packaged renderer (file://) or, in development,
 * the dev server's origin. Anything else (a link in a receipt text, a redirect) is blocked.
 */
export function isAllowedNavigation(url: string, devUrl: string | undefined): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (target.protocol === "file:") return true;
  if (!devUrl) return false;
  try {
    return target.origin === new URL(devUrl).origin;
  } catch {
    return false;
  }
}

const BASE = "/api";

let adminPin: string | null = null;

function getAdminPin(): string | null {
  if (!adminPin) {
    adminPin = localStorage.getItem("pos-admin-pin");
  }
  return adminPin;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const pin = getAdminPin();
  if (pin) {
    headers["x-admin-pin"] = pin;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  setAdminPin: (pin: string) => {
    adminPin = pin;
    localStorage.setItem("pos-admin-pin", pin);
  },
  clearAdminPin: () => {
    adminPin = null;
    localStorage.removeItem("pos-admin-pin");
  },
};

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
    throw new Error(err.error || "Anfrage fehlgeschlagen");
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),

  upload: async <T>(path: string, file: File, extraFields?: Record<string, string>): Promise<T> => {
    const formData = new FormData();
    formData.append("file", file);
    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }
    const headers: Record<string, string> = {};
    const pin = getAdminPin();
    if (pin) {
      headers["x-admin-pin"] = pin;
    }
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.errors?.[0] || err.error || "Anfrage fehlgeschlagen");
    }
    return res.json();
  },

  downloadCsv: async (path: string, body?: unknown): Promise<void> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const pin = getAdminPin();
    if (pin) {
      headers["x-admin-pin"] = pin;
    }
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Anfrage fehlgeschlagen");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog-export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  setAdminPin: (pin: string) => {
    adminPin = pin;
    localStorage.setItem("pos-admin-pin", pin);
  },
  clearAdminPin: () => {
    adminPin = null;
    localStorage.removeItem("pos-admin-pin");
  },
};

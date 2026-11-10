export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  pg: {
    connectionString:
      process.env.DATABASE_URL || "postgresql://pos:pos@localhost:5432/pos",
  },
  adminPin: process.env.ADMIN_PIN || "0000",
  staticDir: process.env.STATIC_DIR || undefined,
};

/**
 * Refuses to start in production with the insecure development PIN fallback
 * or a PIN the admin keypad cannot type (4–6 digits).
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const pin = env.ADMIN_PIN;
  if (!pin) {
    throw new Error("ADMIN_PIN must be set in production");
  }
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error("ADMIN_PIN must be 4 to 6 digits in production");
  }
  if (pin === "0000") {
    throw new Error("ADMIN_PIN must not be the development default 0000 in production");
  }
}

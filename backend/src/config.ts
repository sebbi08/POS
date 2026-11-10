export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  pg: {
    connectionString:
      process.env.DATABASE_URL || "postgresql://pos:pos@localhost:5432/pos",
  },
  adminPin: process.env.ADMIN_PIN || "0000",
  staticDir: process.env.STATIC_DIR || undefined,
};

/** Refuses to start in production with the insecure development PIN fallback. */
export function assertProductionConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production" && !env.ADMIN_PIN) {
    throw new Error("ADMIN_PIN must be set in production");
  }
}

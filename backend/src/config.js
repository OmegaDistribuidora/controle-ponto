const path = require("path");
const dotenv = require("dotenv");

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend", ".env"),
  path.resolve(__dirname, "..", ".env")
];

for (const envPath of envCandidates) {
  dotenv.config({ path: envPath, override: false });
}

const toBool = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
};

const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  timezone: "America/Fortaleza",
  toleranceMinutes: Number(process.env.PUNCH_TOLERANCE_MINUTES || 5),
  maxPunchDistanceMeters: Number(process.env.PUNCH_MAX_DISTANCE_METERS || 100),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  postgres: {
    connectionString: process.env.DATABASE_URL || "",
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "controle_ponto",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    ssl: toBool(process.env.DB_SSL, false)
  },
  drive: {
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI || "https://developers.google.com/oauthplayground",
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "",
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || ""
  },
  seed: {
    rh: {
      cpf: process.env.SEED_RH_CPF || "rh",
      password: process.env.SEED_RH_PASSWORD || "Carlos@123",
      name: process.env.SEED_RH_NAME || "RH"
    },
    admin: {
      cpf: process.env.SEED_ADMIN_CPF || "admin",
      password: process.env.SEED_ADMIN_PASSWORD || "Omega@123",
      name: process.env.SEED_ADMIN_NAME || "Admin"
    }
  }
};

module.exports = { config };

const path = require("path");
const cors = require("cors");
const express = require("express");
const { config } = require("./config");
const { initDb } = require("./db");
const authRoutes = require("./routes/auth");
const publicRoutes = require("./routes/public");
const userRoutes = require("./routes/user");
const hrRoutes = require("./routes/hr");

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origem nao permitida."));
    }
  })
);
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "backend", "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timezone: config.timezone });
});

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/user", userRoutes);
app.use("/api/hr", hrRoutes);

const start = async () => {
  try {
    await initDb();
    app.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`API rodando na porta ${config.port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Falha ao iniciar API:", error);
    process.exit(1);
  }
};

start();

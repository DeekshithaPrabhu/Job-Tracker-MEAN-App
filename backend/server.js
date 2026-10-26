require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const jobRoutes = require("./routes/jobs");
const jobDetailRoutes = require("./routes/job-details");
const eventRoutes = require("./routes/events");
const analyticsRoutes = require("./routes/analytics");
const filterRoutes = require("./routes/filters");

const { requireAuth } = require("./middleware/auth");
const { securityHeaders, sameOriginOnly } = require("./middleware/security");

const app = express();

// Read environment variables safely.
const MONGODB_URI = process.env.MONGODB_URI;

const ORIGINS = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Trust proxy only when explicitly configured.
if (process.env.TRUST_PROXY) {
  app.set(
    "trust proxy",
    process.env.TRUST_PROXY === "true"
      ? true
      : Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY,
  );
}

app.disable("x-powered-by");

app.use(securityHeaders);

app.use(
  cors({
    origin: ORIGINS,
    credentials: true,
  }),
);

app.use(sameOriginOnly(ORIGINS));

app.use(express.json({ limit: "1mb" }));

// Health check does not require a database connection.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
  });
});

// Cache the MongoDB connection promise within this serverless instance.
let dbConnectionPromise = null;

async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not configured");
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!dbConnectionPromise) {
    dbConnectionPromise = mongoose.connect(MONGODB_URI).catch((err) => {
      dbConnectionPromise = null;
      throw err;
    });
  }

  await dbConnectionPromise;
}

// Ensure the database is available before handling API requests.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);

    return res.status(503).json({
      message: "Database temporarily unavailable",
    });
  }
});

// Authentication routes.
app.use("/api/auth", authRoutes);

// Routes requiring an authenticated user.
app.use("/api/jobs/:jobId", requireAuth, jobDetailRoutes);
app.use("/api/jobs", requireAuth, jobRoutes);
app.use("/api/events", requireAuth, eventRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/filters", requireAuth, filterRoutes);

// Unknown routes.
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Central error handler.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err.name === "ValidationError") {
    const errors = Object.fromEntries(
      Object.entries(err.errors).map(([path, error]) => [path, error.message]),
    );

    return res.status(400).json({
      message: "Please fix the highlighted fields",
      errors,
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      message: `Invalid value for ${err.path}`,
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      message: "Request body is too large",
      errors: {
        file: "Files can be up to 10 MB.",
      },
    });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Request body is not valid JSON",
    });
  }

  console.error("Unhandled API error:", err);

  return res.status(500).json({
    message: "Something went wrong on the server",
  });
});

// IMPORTANT:
// Do not call app.listen() in this Vercel entry point.
// Vercel handles incoming requests to the exported Express app.

module.exports = app;

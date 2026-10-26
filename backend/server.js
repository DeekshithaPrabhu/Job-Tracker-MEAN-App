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

// =====================================================
// 1. Environment configuration
// =====================================================

const MONGODB_URI = process.env.MONGODB_URI;

const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

// Configure trusted proxy only when explicitly specified.
if (process.env.TRUST_PROXY) {
  app.set(
    "trust proxy",
    process.env.TRUST_PROXY === "true"
      ? true
      : Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY,
  );
}

app.disable("x-powered-by");

// =====================================================
// 2. Security and CORS middleware
// =====================================================

app.use(securityHeaders);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin, such as certain server-to-server calls.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, "");

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked origin:", origin);

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Retain the existing security middleware.
// Its behavior depends on middleware/security.js.
app.use(sameOriginOnly(allowedOrigins));

// =====================================================
// 3. Request body parsing
// =====================================================

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// =====================================================
// 4. Health check
// =====================================================

// This endpoint does not require a database connection.
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
  });
});

// Root endpoint.
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Job Tracker API is running",
  });
});

// =====================================================
// 5. MongoDB connection for Vercel serverless
// =====================================================

let dbConnectionPromise = null;

async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not configured");
  }

  // Reuse an established connection.
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // Reuse an in-progress connection attempt.
  if (!dbConnectionPromise) {
    dbConnectionPromise = mongoose.connect(MONGODB_URI).catch((error) => {
      dbConnectionPromise = null;
      throw error;
    });
  }

  await dbConnectionPromise;
}

// Connect before processing database-dependent API requests.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    return res.status(503).json({
      message: "Database temporarily unavailable",
    });
  }
});

// =====================================================
// 6. API routes
// =====================================================

// Public authentication routes.
// The routes themselves should enforce appropriate validation.
app.use("/api/auth", authRoutes);

// Protected routes.
app.use("/api/jobs/:jobId", requireAuth, jobDetailRoutes);
app.use("/api/jobs", requireAuth, jobRoutes);
app.use("/api/events", requireAuth, eventRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/filters", requireAuth, filterRoutes);

// =====================================================
// 7. 404 handler
// =====================================================

app.use((req, res) => {
  return res.status(404).json({
    message: "Route not found",
  });
});

// =====================================================
// 8. Central error handler
// =====================================================

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
        file: "The request exceeds the allowed size.",
      },
    });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Request body is not valid JSON",
    });
  }

  if (err.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      message: "Origin not allowed",
    });
  }

  console.error("Unhandled API error:", err);

  return res.status(500).json({
    message: "Something went wrong on the server",
  });
});

// =====================================================
// 9. Export Express app for Vercel
// =====================================================

// Do not call app.listen() in this Vercel entry point.
module.exports = app;

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const jobRoutes = require("./routes/jobs");
const eventRoutes = require("./routes/events");
const analyticsRoutes = require("./routes/analytics");
const filterRoutes = require("./routes/filters");
const Job = require("./models/Job");
const { STATUSES, APPLIED_STAGES } = Job;

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/jobs", jobRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/filters", filterRoutes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Central error handler: turns Mongoose errors into readable 400 responses.
app.use((err, req, res, next) => {
  if (err.name === "ValidationError") {
    const errors = Object.fromEntries(
      Object.entries(err.errors).map(([path, e]) => [path, e.message]),
    );
    return res
      .status(400)
      .json({ message: "Please fix the highlighted fields", errors });
  }
  if (err.name === "CastError")
    return res.status(400).json({ message: `Invalid value for ${err.path}` });
  if (err.type === "entity.parse.failed")
    return res.status(400).json({ message: "Request body is not valid JSON" });
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server" });
});

// Jobs saved before the pipeline feature get a starting status and history entry.
async function backfillStatus() {
  try {
    const first = STATUSES[0];
    const savedAt = { $ifNull: ["$dateSaved", "$$NOW"] };
    const res = await Job.collection.updateMany(
      { status: { $exists: false } },
      [
        {
          $set: {
            status: first,
            statusChangedAt: savedAt,
            statusHistory: [
              { from: null, to: first, changedAt: savedAt, note: "Job saved" },
            ],
          },
        },
      ],
    );
    if (res.modifiedCount)
      console.log(`Backfilled status on ${res.modifiedCount} existing jobs`);
  } catch (err) {
    console.warn("Status backfill skipped:", err.message);
  }
}

// Jobs saved before priorities and application dates existed get a Medium priority and an applied date
// taken from the first time they reached an applied stage in their history.
async function backfillSearchFields() {
  try {
    const priority = await Job.collection.updateMany(
      { priority: { $exists: false } },
      { $set: { priority: "Medium" } },
    );
    const applied = await Job.collection.updateMany(
      {
        appliedAt: { $exists: false },
        $or: [
          { status: { $in: APPLIED_STAGES } },
          { "statusHistory.to": { $in: APPLIED_STAGES } },
        ],
      },
      [
        {
          $set: {
            appliedAt: {
              $let: {
                vars: {
                  hits: {
                    $filter: {
                      input: { $ifNull: ["$statusHistory", []] },
                      as: "h",
                      cond: { $in: ["$$h.to", APPLIED_STAGES] },
                    },
                  },
                },
                in: {
                  $ifNull: [
                    { $min: "$$hits.changedAt" },
                    "$statusChangedAt",
                    "$dateSaved",
                    "$$NOW",
                  ],
                },
              },
            },
          },
        },
      ],
    );
    if (priority.modifiedCount || applied.modifiedCount) {
      console.log(
        `Backfilled priority on ${priority.modifiedCount} and application date on ${applied.modifiedCount} existing jobs`,
      );
    }
  } catch (err) {
    console.warn("Search field backfill skipped:", err.message);
  }
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    return backfillStatus()
      .then(backfillSearchFields)
      .then(() =>
        app.listen(PORT, () =>
          console.log(`API listening on http://localhost:${PORT}`),
        ),
      );
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });

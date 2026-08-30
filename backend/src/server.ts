import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import helmet from "helmet";
import hpp from "hpp";
import { createServer } from "http";
import "dotenv/config";

import { connectDB } from "./config/db";
import { initRedis } from "./config/redis";
import { initSocketServer } from "./config/socket";
import authRouter from "./routes/auth";
import busesRouter from "./routes/buses";
import studentsRouter from "./routes/students";
import feesRouter from "./routes/fees";
import expensesRouter from "./routes/expenses";
import reportsRouter from "./routes/reports";
import feeStructureRouter from "./routes/fee-structure";
import schoolFeesRouter from "./routes/school-fees";
import parentRouter from "./routes/parent";
import orgUsersRouter from "./routes/org/users";
import orgOrganizationRouter from "./routes/org/organization";
import organizationsRouter from "./routes/organizations";
import superAdminOrganizationsRouter from "./routes/superadmin/organizations";
import superAdminDashboardRouter from "./routes/superadmin/dashboard";
import superAdminUsersRouter from "./routes/superadmin/users";
import bulkRouter from "./routes/bulk";
import transportRouter from "./routes/transport";
import paymentsRouter, { paymentsWebhookRouter } from "./routes/payments";
import { gpsRouter, traccarWebhookRouter } from "./routes/gps";
import { requireFeature } from "./middleware/featureFlag";
import { auth, type AuthenticatedRequest } from "./middleware/auth";
import { require2FA } from "./middleware/require2FA";
import { orgScope } from "./middleware/orgScope";
import { requireOrgScope } from "./middleware/requireOrgScope";
import path from "path";

import { ensureLogosDir } from "./utils/logoStorage";
import orgThemeRouter from "./routes/org/theme";
import adminBrandingRouter from "./routes/admin/branding";

const app = express();
const port = Number(process.env.PORT) || 5000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-client"]
  })
);
app.use(cookieParser());
app.use(hpp());

// Razorpay webhook requires raw body — must be registered before express.json()
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentsWebhookRouter
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// Express 5: sanitize body only (default middleware mutates read-only req.query)
app.use((req, _res, next) => {
  if (req.body) {
    req.body = mongoSanitize.sanitize(req.body);
  }
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

if (process.env.NODE_ENV === "production") {
  app.use("/api/", apiLimiter);
}

ensureLogosDir();
app.use("/logos", express.static(path.join(process.cwd(), "public", "logos")));

app.use("/api/auth", authRouter);
app.use("/api/org/theme", orgThemeRouter);
app.use("/api/admin/settings/branding", adminBrandingRouter);
app.use("/api/superadmin/organizations", auth, require2FA, superAdminOrganizationsRouter);
app.use("/api/superadmin/dashboard", auth, require2FA, superAdminDashboardRouter);
app.use("/api/superadmin/users", auth, require2FA, superAdminUsersRouter);
app.use("/api/org/users", orgUsersRouter);
app.use("/api/org/organization", orgOrganizationRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/buses", busesRouter);
app.use("/api/students", studentsRouter);
app.use("/api/fees", feesRouter);
app.use("/api/fee-structure", feeStructureRouter);
app.use("/api/school-fees", schoolFeesRouter);
app.use("/api/parent", parentRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/bulk", bulkRouter);
app.use("/api/transport", transportRouter);
app.use("/api/payments", auth, orgScope, requireOrgScope, paymentsRouter);
app.use("/api/traccar-webhook", traccarWebhookRouter);
app.use(
  "/api/gps",
  auth,
  orgScope,
  requireOrgScope,
  requireFeature("gpsTracking"),
  gpsRouter
);

interface AppError extends Error {
  statusCode?: number;
  code?: number;
  keyValue?: Record<string, string>;
  errors?: Record<string, { message: string }>;
}

app.use(
  (err: AppError, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const isDev = process.env.NODE_ENV === "development";
    const authReq = req as AuthenticatedRequest;

    console.error({
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      userId: authReq.user?.userId,
      orgId: authReq.user?.organizationId
    });

    if (err.code === 11000 && err.keyValue) {
      const field = Object.keys(err.keyValue)[0];
      res.status(400).json({
        success: false,
        data: null,
        message: `${field} already exists.`
      });
      return;
    }

    if (err.name === "ValidationError" && err.errors) {
      const messages = Object.values(err.errors).map((e) => e.message);
      res.status(400).json({
        success: false,
        data: null,
        message: messages.join(", ")
      });
      return;
    }

    if (err.name === "JsonWebTokenError") {
      res.status(401).json({ success: false, data: null, message: "Invalid token." });
      return;
    }

    res.status(err.statusCode || 500).json({
      success: false,
      data: null,
      message: isDev ? err.message : "Something went wrong.",
      ...(isDev && { stack: err.stack })
    });
  }
);

const startServer = async (): Promise<void> => {
  await connectDB();
  await initRedis();

  const httpServer = createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend running on port ${port}`);
  });
};
void startServer();

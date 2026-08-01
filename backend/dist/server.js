"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const express_mongo_sanitize_1 = __importDefault(require("express-mongo-sanitize"));
const helmet_1 = __importDefault(require("helmet"));
const hpp_1 = __importDefault(require("hpp"));
const http_1 = require("http");
require("dotenv/config");
const db_1 = require("./config/db");
const redis_1 = require("./config/redis");
const socket_1 = require("./config/socket");
const auth_1 = __importDefault(require("./routes/auth"));
const buses_1 = __importDefault(require("./routes/buses"));
const students_1 = __importDefault(require("./routes/students"));
const fees_1 = __importDefault(require("./routes/fees"));
const expenses_1 = __importDefault(require("./routes/expenses"));
const reports_1 = __importDefault(require("./routes/reports"));
const fee_structure_1 = __importDefault(require("./routes/fee-structure"));
const school_fees_1 = __importDefault(require("./routes/school-fees"));
const parent_1 = __importDefault(require("./routes/parent"));
const users_1 = __importDefault(require("./routes/org/users"));
const organization_1 = __importDefault(require("./routes/org/organization"));
const organizations_1 = __importDefault(require("./routes/superadmin/organizations"));
const dashboard_1 = __importDefault(require("./routes/superadmin/dashboard"));
const users_2 = __importDefault(require("./routes/superadmin/users"));
const bulk_1 = __importDefault(require("./routes/bulk"));
const transport_1 = __importDefault(require("./routes/transport"));
const payments_1 = __importStar(require("./routes/payments"));
const gps_1 = require("./routes/gps");
const featureFlag_1 = require("./middleware/featureFlag");
const auth_2 = require("./middleware/auth");
const require2FA_1 = require("./middleware/require2FA");
const orgScope_1 = require("./middleware/orgScope");
const requireOrgScope_1 = require("./middleware/requireOrgScope");
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 5000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
app.set("trust proxy", 1);
app.use((0, helmet_1.default)());
app.use((0, compression_1.default)());
app.use((0, cors_1.default)({
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-client"]
}));
app.use((0, cookie_parser_1.default)());
app.use((0, hpp_1.default)());
// Razorpay webhook requires raw body — must be registered before express.json()
app.use("/api/payments/webhook", express_1.default.raw({ type: "application/json" }), payments_1.paymentsWebhookRouter);
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
// Express 5: sanitize body only (default middleware mutates read-only req.query)
app.use((req, _res, next) => {
    if (req.body) {
        req.body = express_mongo_sanitize_1.default.sanitize(req.body);
    }
    next();
});
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { success: false, message: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false
});
if (process.env.NODE_ENV === "production") {
    app.use("/api/", apiLimiter);
}
app.use("/api/auth", auth_1.default);
app.use("/api/superadmin/organizations", auth_2.auth, require2FA_1.require2FA, organizations_1.default);
app.use("/api/superadmin/dashboard", auth_2.auth, require2FA_1.require2FA, dashboard_1.default);
app.use("/api/superadmin/users", auth_2.auth, require2FA_1.require2FA, users_2.default);
app.use("/api/org/users", users_1.default);
app.use("/api/org/organization", organization_1.default);
app.use("/api/buses", buses_1.default);
app.use("/api/students", students_1.default);
app.use("/api/fees", fees_1.default);
app.use("/api/fee-structure", fee_structure_1.default);
app.use("/api/school-fees", school_fees_1.default);
app.use("/api/parent", parent_1.default);
app.use("/api/expenses", expenses_1.default);
app.use("/api/reports", reports_1.default);
app.use("/api/bulk", bulk_1.default);
app.use("/api/transport", transport_1.default);
app.use("/api/payments", auth_2.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, payments_1.default);
app.use("/api/traccar-webhook", gps_1.traccarWebhookRouter);
app.use("/api/gps", auth_2.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, (0, featureFlag_1.requireFeature)("gpsTracking"), gps_1.gpsRouter);
app.use((err, req, res, _next) => {
    const isDev = process.env.NODE_ENV === "development";
    const authReq = req;
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
});
const startServer = async () => {
    await (0, db_1.connectDB)();
    await (0, redis_1.initRedis)();
    const httpServer = (0, http_1.createServer)(app);
    (0, socket_1.initSocketServer)(httpServer);
    httpServer.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Backend running on port ${port}`);
    });
};
void startServer();

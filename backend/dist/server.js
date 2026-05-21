"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const express_mongo_sanitize_1 = __importDefault(require("express-mongo-sanitize"));
const helmet_1 = __importDefault(require("helmet"));
const hpp_1 = __importDefault(require("hpp"));
require("dotenv/config");
const db_1 = require("./config/db");
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
const organizations_1 = __importDefault(require("./routes/superadmin/organizations"));
const users_2 = __importDefault(require("./routes/superadmin/users"));
const bulk_1 = __importDefault(require("./routes/bulk"));
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 5000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
app.use((0, helmet_1.default)());
app.use((0, compression_1.default)());
app.use((0, cors_1.default)({
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use((0, hpp_1.default)());
app.use(express_1.default.json({ limit: "10kb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10kb" }));
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
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Too many login attempts." }
});
if (process.env.NODE_ENV === "production") {
    app.use("/api/auth/login", authLimiter);
    app.use("/api/", apiLimiter);
}
app.use("/api/auth", auth_1.default);
app.use("/api/superadmin/organizations", organizations_1.default);
app.use("/api/superadmin/users", users_2.default);
app.use("/api/org/users", users_1.default);
app.use("/api/buses", buses_1.default);
app.use("/api/students", students_1.default);
app.use("/api/fees", fees_1.default);
app.use("/api/fee-structure", fee_structure_1.default);
app.use("/api/school-fees", school_fees_1.default);
app.use("/api/parent", parent_1.default);
app.use("/api/expenses", expenses_1.default);
app.use("/api/reports", reports_1.default);
app.use("/api/bulk", bulk_1.default);
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
    app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Backend running on port ${port}`);
    });
};
void startServer();

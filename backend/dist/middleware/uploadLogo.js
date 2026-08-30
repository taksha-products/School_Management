"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLogo = void 0;
const multer_1 = __importDefault(require("multer"));
const logoStorage_1 = require("../utils/logoStorage");
exports.uploadLogo = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1
    },
    fileFilter: (_req, file, cb) => {
        if ((0, logoStorage_1.isAllowedLogoMime)(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error("Logo must be JPG, PNG, SVG, or WebP (max 2MB)"));
    }
}).single("logo");

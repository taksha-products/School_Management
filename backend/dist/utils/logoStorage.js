"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowedLogoMime = exports.removeOrganizationLogos = exports.saveOrganizationLogo = exports.ensureLogosDir = exports.LOGOS_DIR = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOGO_EXTENSIONS = ["jpg", "jpeg", "png", "svg", "webp"];
exports.LOGOS_DIR = path_1.default.join(process.cwd(), "public", "logos");
const ensureLogosDir = () => {
    fs_1.default.mkdirSync(exports.LOGOS_DIR, { recursive: true });
};
exports.ensureLogosDir = ensureLogosDir;
const extensionFromMime = (mimetype) => {
    switch (mimetype) {
        case "image/jpeg":
            return "jpg";
        case "image/png":
            return "png";
        case "image/svg+xml":
            return "svg";
        case "image/webp":
            return "webp";
        default:
            return null;
    }
};
const saveOrganizationLogo = (organizationId, buffer, mimetype) => {
    const ext = extensionFromMime(mimetype);
    if (!ext) {
        throw new Error("Unsupported logo format");
    }
    (0, exports.ensureLogosDir)();
    (0, exports.removeOrganizationLogos)(organizationId);
    const filename = `${organizationId}.${ext}`;
    const absolutePath = path_1.default.join(exports.LOGOS_DIR, filename);
    fs_1.default.writeFileSync(absolutePath, buffer);
    return `/logos/${filename}`;
};
exports.saveOrganizationLogo = saveOrganizationLogo;
const removeOrganizationLogos = (organizationId) => {
    (0, exports.ensureLogosDir)();
    for (const ext of LOGO_EXTENSIONS) {
        const candidate = path_1.default.join(exports.LOGOS_DIR, `${organizationId}.${ext}`);
        if (fs_1.default.existsSync(candidate)) {
            fs_1.default.unlinkSync(candidate);
        }
    }
};
exports.removeOrganizationLogos = removeOrganizationLogos;
const isAllowedLogoMime = (mimetype) => extensionFromMime(mimetype) !== null;
exports.isAllowedLogoMime = isAllowedLogoMime;

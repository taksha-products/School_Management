import multer from "multer";

import { isAllowedLogoMime } from "../utils/logoStorage";

export const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (isAllowedLogoMime(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Logo must be JPG, PNG, SVG, or WebP (max 2MB)"));
  }
}).single("logo");

import fs from "fs";
import path from "path";

const LOGO_EXTENSIONS = ["jpg", "jpeg", "png", "svg", "webp"] as const;

export type LogoExtension = (typeof LOGO_EXTENSIONS)[number];

export const LOGOS_DIR = path.join(process.cwd(), "public", "logos");

export const ensureLogosDir = (): void => {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
};

const extensionFromMime = (mimetype: string): LogoExtension | null => {
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

export const saveOrganizationLogo = (
  organizationId: string,
  buffer: Buffer,
  mimetype: string
): string => {
  const ext = extensionFromMime(mimetype);
  if (!ext) {
    throw new Error("Unsupported logo format");
  }

  ensureLogosDir();
  removeOrganizationLogos(organizationId);

  const filename = `${organizationId}.${ext}`;
  const absolutePath = path.join(LOGOS_DIR, filename);
  fs.writeFileSync(absolutePath, buffer);

  return `/logos/${filename}`;
};

export const removeOrganizationLogos = (organizationId: string): void => {
  ensureLogosDir();
  for (const ext of LOGO_EXTENSIONS) {
    const candidate = path.join(LOGOS_DIR, `${organizationId}.${ext}`);
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }
};

export const isAllowedLogoMime = (mimetype: string): boolean =>
  extensionFromMime(mimetype) !== null;

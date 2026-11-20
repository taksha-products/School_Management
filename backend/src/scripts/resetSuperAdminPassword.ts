import "dotenv/config";
import bcrypt from "bcryptjs";

import { connectDB } from "../config/db";
import { User } from "../models/User";

const usage = (): void => {
  console.log(`
Usage:
  RESET_PASSWORD='YourNewPass1' npm run reset-super-admin -- [email] [--disable-2fa]

Examples:
  RESET_PASSWORD='SuperAdmin2026!' npm run reset-super-admin -- super@bustrack.com --disable-2fa
  RESET_PASSWORD='SuperAdmin2026!' npm run reset-super-admin -- super@taksha.com
`);
};

const validatePassword = (password: string): string | null => {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const disable2fa = args.includes("--disable-2fa");
  const emailArg = args.find((arg) => !arg.startsWith("--"));

  const email = (emailArg ?? process.env.RESET_EMAIL ?? "super@bustrack.com").toLowerCase();
  const password = process.env.RESET_PASSWORD;

  if (!password) {
    console.error("Error: set RESET_PASSWORD in the environment.\n");
    usage();
    process.exit(1);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    console.error(`Error: ${passwordError}`);
    process.exit(1);
  }

  await connectDB();

  const user = await User.findOne({ email, role: "superAdmin" }).select(
    "+twoFactorSecret +backupCodes name email role twoFactorEnabled"
  );

  if (!user) {
    console.error(`No super admin found with email: ${email}`);
    process.exit(1);
  }

  user.passwordHash = await bcrypt.hash(password, 12);

  if (disable2fa) {
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorVerifiedAt = undefined;
    user.backupCodes = [];
  }

  await user.save();

  console.log(`Super admin password updated for ${user.email}`);
  if (disable2fa) {
    console.log("2FA disabled — sign in and re-enable it under Super → Settings → Security.");
  }
  process.exit(0);
};

void main().catch((error: unknown) => {
  console.error("Reset failed:", error);
  process.exit(1);
});

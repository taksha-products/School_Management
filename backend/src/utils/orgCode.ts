import { Organization } from "../models/Organization";

export const slugifyOrgName = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const generateUniqueOrgCode = async (name: string): Promise<string> => {
  const year = new Date().getFullYear();
  const base = slugifyOrgName(name) || "org";
  let code = `${base}-${year}`;
  let suffix = 0;

  while (await Organization.exists({ code })) {
    suffix += 1;
    code = `${base}-${year}-${suffix}`;
  }

  return code;
};

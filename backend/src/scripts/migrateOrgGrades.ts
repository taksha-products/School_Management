import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../config/db";
import { Organization } from "../models/Organization";
import type { OrgGradeEntry } from "../models/Organization";

const DEFAULT_SECTION_LABELS = ["A", "B", "C", "D"];

interface LegacyOrganizationDoc {
  _id: mongoose.Types.ObjectId;
  name: string;
  gradeLabels?: string[];
  hasSections?: boolean;
  sectionLabels?: string[];
  grades?: OrgGradeEntry[];
}

const convertLegacyGrades = (org: LegacyOrganizationDoc): OrgGradeEntry[] | null => {
  if (Array.isArray(org.grades) && org.grades.length > 0) {
    return null;
  }

  if (!Array.isArray(org.gradeLabels) || org.gradeLabels.length === 0) {
    return [];
  }

  const sections =
    org.hasSections && Array.isArray(org.sectionLabels) && org.sectionLabels.length > 0
      ? org.sectionLabels
      : org.hasSections
        ? DEFAULT_SECTION_LABELS
        : [];

  return org.gradeLabels.map((label) => ({
    label: label.trim(),
    sections: org.hasSections
      ? sections.map((section) => section.trim()).filter((section) => section.length > 0)
      : []
  }));
};

const migrateOrgGrades = async (): Promise<void> => {
  await connectDB();
  console.log("Connected to MongoDB\nMigrating organization grade configuration...\n");

  const collection = Organization.collection;
  const cursor = collection.find({});

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const org = doc as LegacyOrganizationDoc;
    const grades = convertLegacyGrades(org);

    if (grades === null) {
      skipped += 1;
      continue;
    }

    await collection.updateOne(
      { _id: org._id },
      {
        $set: { grades },
        $unset: { gradeLabels: "", hasSections: "", sectionLabels: "" }
      }
    );

    migrated += 1;
    console.log(`  ✓ ${org.name}: ${grades.length} grade(s)`);
  }

  console.log(`\nDone. Scanned ${scanned}, migrated ${migrated}, skipped ${skipped}.`);
  await mongoose.disconnect();
};

void migrateOrgGrades()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });

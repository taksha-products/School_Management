"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const db_1 = require("../config/db");
const Organization_1 = require("../models/Organization");
const DEFAULT_SECTION_LABELS = ["A", "B", "C", "D"];
const convertLegacyGrades = (org) => {
    if (Array.isArray(org.grades) && org.grades.length > 0) {
        return null;
    }
    if (!Array.isArray(org.gradeLabels) || org.gradeLabels.length === 0) {
        return [];
    }
    const sections = org.hasSections && Array.isArray(org.sectionLabels) && org.sectionLabels.length > 0
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
const migrateOrgGrades = async () => {
    await (0, db_1.connectDB)();
    console.log("Connected to MongoDB\nMigrating organization grade configuration...\n");
    const collection = Organization_1.Organization.collection;
    const cursor = collection.find({});
    let scanned = 0;
    let migrated = 0;
    let skipped = 0;
    for await (const doc of cursor) {
        scanned += 1;
        const org = doc;
        const grades = convertLegacyGrades(org);
        if (grades === null) {
            skipped += 1;
            continue;
        }
        await collection.updateOne({ _id: org._id }, {
            $set: { grades },
            $unset: { gradeLabels: "", hasSections: "", sectionLabels: "" }
        });
        migrated += 1;
        console.log(`  ✓ ${org.name}: ${grades.length} grade(s)`);
    }
    console.log(`\nDone. Scanned ${scanned}, migrated ${migrated}, skipped ${skipped}.`);
    await mongoose_1.default.disconnect();
};
void migrateOrgGrades()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
});

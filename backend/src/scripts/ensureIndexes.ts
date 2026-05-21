import "dotenv/config";
import mongoose from "mongoose";

import { connectDB } from "../config/db";
import { Bus } from "../models/Bus";
import { Expense } from "../models/Expense";
import { FeeGroup } from "../models/FeeGroup";
import { FeeLedger } from "../models/FeeLedger";
import { FeePayment } from "../models/FeePayment";
import { FeeStructure } from "../models/FeeStructure";
import { Organization } from "../models/Organization";
import { SchoolFeePayment } from "../models/SchoolFeePayment";
import { Student } from "../models/Student";
import { StudentFeeAssignment } from "../models/StudentFeeAssignment";
import { User } from "../models/User";

const models = [
  Organization,
  User,
  Bus,
  Student,
  FeePayment,
  FeeGroup,
  Expense,
  FeeStructure,
  StudentFeeAssignment,
  FeeLedger,
  SchoolFeePayment
] as const;

const ensureIndexes = async (): Promise<void> => {
  await connectDB();
  console.log("Connected to MongoDB\nSyncing indexes...\n");

  for (const model of models) {
    const { toDrop, toCreate } = await model.diffIndexes();

    if (toDrop.length > 0) {
      console.log(`[${model.modelName}] dropping obsolete: ${toDrop.join(", ")}`);
    }
    if (toCreate.length > 0) {
      console.log(`[${model.modelName}] creating: ${toCreate.join(", ")}`);
    }

    const dropped = await model.syncIndexes();
    if (dropped.length > 0) {
      console.log(`[${model.modelName}] dropped: ${dropped.join(", ")}`);
    }

    const indexes = await model.collection.indexes();
    console.log(`[${model.modelName}] active indexes (${indexes.length}):`);
    for (const idx of indexes) {
      const name = idx.name ?? "_id_";
      const keys = JSON.stringify(idx.key);
      console.log(`  • ${name}: ${keys}`);
    }
    console.log("");
  }

  console.log("Index sync complete.");
  await mongoose.disconnect();
};

void ensureIndexes()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Index sync failed:", error);
    process.exit(1);
  });

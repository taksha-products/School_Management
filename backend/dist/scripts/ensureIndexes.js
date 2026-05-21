"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const db_1 = require("../config/db");
const Bus_1 = require("../models/Bus");
const Expense_1 = require("../models/Expense");
const FeeGroup_1 = require("../models/FeeGroup");
const FeeLedger_1 = require("../models/FeeLedger");
const FeePayment_1 = require("../models/FeePayment");
const FeeStructure_1 = require("../models/FeeStructure");
const Organization_1 = require("../models/Organization");
const SchoolFeePayment_1 = require("../models/SchoolFeePayment");
const Student_1 = require("../models/Student");
const StudentFeeAssignment_1 = require("../models/StudentFeeAssignment");
const User_1 = require("../models/User");
const models = [
    Organization_1.Organization,
    User_1.User,
    Bus_1.Bus,
    Student_1.Student,
    FeePayment_1.FeePayment,
    FeeGroup_1.FeeGroup,
    Expense_1.Expense,
    FeeStructure_1.FeeStructure,
    StudentFeeAssignment_1.StudentFeeAssignment,
    FeeLedger_1.FeeLedger,
    SchoolFeePayment_1.SchoolFeePayment
];
const ensureIndexes = async () => {
    await (0, db_1.connectDB)();
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
    await mongoose_1.default.disconnect();
};
void ensureIndexes()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error("Index sync failed:", error);
    process.exit(1);
});

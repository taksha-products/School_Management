"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./config/db");
const Bus_1 = require("./models/Bus");
const Expense_1 = require("./models/Expense");
const FeeGroup_1 = require("./models/FeeGroup");
const FeeLedger_1 = require("./models/FeeLedger");
const FeePayment_1 = require("./models/FeePayment");
const FeeStructure_1 = require("./models/FeeStructure");
const Organization_1 = require("./models/Organization");
const SchoolFeePayment_1 = require("./models/SchoolFeePayment");
const Student_1 = require("./models/Student");
const StudentFeeAssignment_1 = require("./models/StudentFeeAssignment");
const User_1 = require("./models/User");
const schoolFeeLedger_1 = require("./utils/schoolFeeLedger");
const seed = async () => {
    await (0, db_1.connectDB)();
    console.log("Connected to MongoDB");
    console.log("Clearing existing collections...");
    await Promise.all([
        User_1.User.deleteMany({}),
        Organization_1.Organization.deleteMany({}),
        Bus_1.Bus.deleteMany({}),
        Student_1.Student.deleteMany({}),
        FeePayment_1.FeePayment.deleteMany({}),
        FeeGroup_1.FeeGroup.deleteMany({}),
        Expense_1.Expense.deleteMany({}),
        FeeStructure_1.FeeStructure.deleteMany({}),
        StudentFeeAssignment_1.StudentFeeAssignment.deleteMany({}),
        FeeLedger_1.FeeLedger.deleteMany({}),
        SchoolFeePayment_1.SchoolFeePayment.deleteMany({})
    ]);
    console.log("Collections cleared");
    console.log("Creating organization...");
    const demoSchool = await Organization_1.Organization.create({
        name: "Demo School",
        code: "demo-school",
        plan: "trial",
        isActive: true
    });
    console.log(`Organization created: ${demoSchool.name}`);
    const orgId = demoSchool._id;
    console.log("Creating users...");
    const [superAdmin, orgAdmin, staff, parent] = await User_1.User.insertMany([
        {
            name: "Super Admin",
            email: "super@bustrack.com",
            passwordHash: await bcryptjs_1.default.hash("super123", 10),
            role: "superAdmin",
            organizationId: null,
            isActive: true
        },
        {
            name: "Demo School Admin",
            email: "admin@demoschool.com",
            passwordHash: await bcryptjs_1.default.hash("admin123", 10),
            role: "orgAdmin",
            organizationId: orgId,
            isActive: true
        },
        {
            name: "Demo School Staff",
            email: "staff@demoschool.com",
            passwordHash: await bcryptjs_1.default.hash("staff123", 10),
            role: "staff",
            organizationId: orgId,
            staffPermissions: {
                canCollectFees: true,
                canManageStudents: false,
                canViewReports: true,
                canManageBuses: false
            },
            isActive: true
        },
        {
            name: "Demo School Parent",
            email: "parent@demoschool.com",
            passwordHash: await bcryptjs_1.default.hash("parent123", 10),
            role: "parent",
            organizationId: orgId,
            parentStudentIds: [],
            isActive: true
        }
    ]);
    console.log("Users created");
    console.log("Creating buses...");
    const busPayload = Array.from({ length: 6 }).map((_, index) => ({
        organizationId: orgId,
        busNumber: `Bus ${index + 1}`,
        routeName: `Route ${String.fromCharCode(65 + index)}`,
        driverName: `Driver ${index + 1}`,
        driverPhone: `90000000${index + 1}`.slice(-10),
        capacity: 40,
        status: "active"
    }));
    const buses = await Bus_1.Bus.insertMany(busPayload);
    console.log(`Created ${buses.length} buses`);
    console.log("Creating students...");
    const studentPayload = buses.flatMap((bus, busIndex) => Array.from({ length: 5 }).map((_, studentIndex) => ({
        organizationId: orgId,
        name: `Student ${busIndex + 1}-${studentIndex + 1}`,
        grade: `${(studentIndex % 5) + 1}`,
        parentName: `Parent ${busIndex + 1}-${studentIndex + 1}`,
        parentPhone: `8000000${busIndex}${studentIndex}`.slice(-10),
        address: `Address line for Student ${busIndex + 1}-${studentIndex + 1}`,
        busId: bus._id,
        monthlyFee: 1500,
        status: "active",
        academicYear: "2025-26"
    })));
    const students = await Student_1.Student.insertMany(studentPayload);
    console.log(`Created ${students.length} students`);
    const student1 = students[0];
    const student2 = students[1];
    await User_1.User.findByIdAndUpdate(parent._id, {
        parentStudentIds: [student1._id, student2._id]
    });
    console.log("Linked parent to students 1 and 2");
    console.log("Creating fee payments...");
    const months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08"];
    const statusCycle = ["paid", "partial", "pending", "overdue"];
    const feePaymentPayload = students.flatMap((student, studentIndex) => months.map((month, monthIndex) => {
        const status = statusCycle[(studentIndex + monthIndex) % statusCycle.length];
        const amount = student.monthlyFee;
        let amountPaid = 0;
        let paidAt;
        let collectedBy;
        let notes;
        if (status === "paid") {
            amountPaid = amount;
            paidAt = new Date(`${month}-10T10:00:00.000Z`);
            collectedBy = orgAdmin._id;
        }
        else if (status === "partial") {
            amountPaid = Math.floor(amount * 0.5);
            paidAt = new Date(`${month}-12T10:00:00.000Z`);
            collectedBy = orgAdmin._id;
            notes = "Partial payment received in cash";
        }
        else if (status === "pending") {
            amountPaid = 0;
            notes = "Payment not collected yet";
        }
        else {
            amountPaid = 0;
            notes = "Overdue payment";
        }
        return {
            organizationId: orgId,
            studentId: student._id,
            busId: student.busId,
            month,
            academicYear: "2025-26",
            amount,
            amountPaid,
            status,
            paidAt,
            collectedBy,
            notes
        };
    }));
    await FeePayment_1.FeePayment.insertMany(feePaymentPayload);
    console.log(`Created ${feePaymentPayload.length} fee payment records`);
    console.log("Creating expenses...");
    const expensePayload = buses.flatMap((bus) => [
        {
            organizationId: orgId,
            busId: bus._id,
            category: "diesel",
            amount: 9000,
            date: new Date("2025-04-05T10:00:00.000Z"),
            vendor: "Local Fuel Station",
            notes: "Monthly diesel refill",
            academicYear: "2025-26",
            addedBy: orgAdmin._id
        },
        {
            organizationId: orgId,
            busId: bus._id,
            category: "maintenance",
            amount: 3500,
            date: new Date("2025-04-15T10:00:00.000Z"),
            vendor: "City Auto Garage",
            notes: "Routine maintenance",
            academicYear: "2025-26",
            addedBy: orgAdmin._id
        },
        {
            organizationId: orgId,
            busId: bus._id,
            category: "other",
            amount: 1200,
            date: new Date("2025-04-20T10:00:00.000Z"),
            vendor: "Accessories Shop",
            notes: "Cleaning and accessories",
            academicYear: "2025-26",
            addedBy: staff._id
        }
    ]);
    await Expense_1.Expense.insertMany(expensePayload);
    console.log(`Created ${expensePayload.length} expense records`);
    console.log("Creating school fee structure...");
    const feeStructure = await FeeStructure_1.FeeStructure.create({
        organizationId: orgId,
        name: "Standard Fee Structure 2025-26",
        academicYear: "2025-26",
        applicableGrades: [],
        feeHeads: [
            {
                name: "Tuition Fee",
                amount: 5000,
                frequency: "monthly",
                dueDay: 10,
                isOptional: false,
                category: "academic"
            },
            {
                name: "Lab Fee",
                amount: 2000,
                frequency: "quarterly",
                dueDay: 15,
                isOptional: false,
                category: "facility"
            },
            {
                name: "Sports Fee",
                amount: 1500,
                frequency: "annual",
                dueDay: 10,
                isOptional: true,
                category: "other"
            }
        ],
        isActive: true
    });
    const assignResult = await (0, schoolFeeLedger_1.assignFeeStructureToStudents)(orgId, feeStructure, students.map((s) => s._id), "2025-26");
    console.log(`Assigned fee structure to ${assignResult.assignments} students, ${assignResult.ledgerEntries} ledger entries created`);
    const aprilLedger = await FeeLedger_1.FeeLedger.findOne({
        studentId: student1._id,
        feeHeadName: "Tuition Fee",
        periodLabel: "2025-04",
        academicYear: "2025-26"
    });
    if (aprilLedger) {
        aprilLedger.amountPaid = aprilLedger.amountDue;
        aprilLedger.status = "paid";
        const samplePayment = await SchoolFeePayment_1.SchoolFeePayment.create({
            organizationId: orgId,
            studentId: student1._id,
            receiptNumber: "RCP-SEED-SAMPLE01",
            academicYear: "2025-26",
            paymentDate: new Date("2025-04-08T10:00:00.000Z"),
            paymentMode: "cash",
            collectedBy: staff._id,
            feeHeadPayments: [
                {
                    feeHeadName: "Tuition Fee",
                    periodLabel: "2025-04",
                    amountDue: aprilLedger.amountDue,
                    amountPaid: aprilLedger.amountDue,
                    lateFee: 0,
                    status: "paid"
                }
            ],
            totalAmountDue: aprilLedger.amountDue,
            totalAmountPaid: aprilLedger.amountDue,
            totalLateFee: 0,
            notes: "Sample school fee payment"
        });
        aprilLedger.paymentId = samplePayment._id;
        await aprilLedger.save();
        console.log("Created sample school fee payment for Student 1-1 (April tuition)");
    }
    console.log("\n--- Seed credentials ---");
    console.log("Super Admin: super@bustrack.com / super123");
    console.log("Org Admin:   admin@demoschool.com / admin123");
    console.log("Staff:       staff@demoschool.com / staff123");
    console.log("Parent:      parent@demoschool.com / parent123");
    console.log(`Organization: ${demoSchool.name} (${demoSchool.code})`);
    console.log("Seeding completed successfully");
};
void seed()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
});

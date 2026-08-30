import "dotenv/config";
import bcrypt from "bcryptjs";

import { connectDB } from "./config/db";
import { Bus } from "./models/Bus";
import { Expense } from "./models/Expense";
import { FeeGroup } from "./models/FeeGroup";
import { FeeLedger } from "./models/FeeLedger";
import { FeePayment, type FeePaymentStatus } from "./models/FeePayment";
import { FeeStructure } from "./models/FeeStructure";
import { Organization } from "./models/Organization";
import { SchoolFeePayment } from "./models/SchoolFeePayment";
import { Student } from "./models/Student";
import { StudentFeeAssignment } from "./models/StudentFeeAssignment";
import { StudentTransport } from "./models/StudentTransport";
import { User } from "./models/User";
import { assignFeeStructureToStudents } from "./utils/schoolFeeLedger";
import { encryptSecretForStorage, generateBackupCodes } from "./utils/totp";

const ACADEMIC_YEAR = "2025-26";
/** Base32 secret used for seeded super-admin 2FA in development/E2E. */
const SEED_SUPER_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

const seed = async (): Promise<void> => {
  await connectDB();
  console.log("Connected to MongoDB");

  console.log("Clearing existing collections...");
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    Bus.deleteMany({}),
    Student.deleteMany({}),
    StudentTransport.deleteMany({}),
    FeePayment.deleteMany({}),
    FeeGroup.deleteMany({}),
    Expense.deleteMany({}),
    FeeStructure.deleteMany({}),
    StudentFeeAssignment.deleteMany({}),
    FeeLedger.deleteMany({}),
    SchoolFeePayment.deleteMany({})
  ]);
  console.log("Collections cleared");

  console.log("Creating organization...");
  const demoSchool = await Organization.create({
    name: "Demo School",
    code: "demo-school",
    plan: "trial",
    isActive: true,
    currentAcademicYear: ACADEMIC_YEAR
  });
  console.log(`Organization created: ${demoSchool.name}`);

  const orgId = demoSchool._id;

  console.log("Creating users...");
  const superAdminBackupCodes = await generateBackupCodes();
  const [superAdmin, orgAdmin, staff, parent] = await User.insertMany([
    {
      name: "Super Admin",
      email: "super@taksha.com",
      passwordHash: await bcrypt.hash("super123", 10),
      role: "superAdmin",
      organizationId: null,
      isActive: true,
      twoFactorEnabled: true,
      twoFactorSecret: encryptSecretForStorage(SEED_SUPER_ADMIN_TOTP_SECRET),
      twoFactorVerifiedAt: new Date(),
      backupCodes: superAdminBackupCodes.hashed
    },
    {
      name: "Demo School Admin",
      email: "admin@demoschool.com",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "orgAdmin",
      organizationId: orgId,
      isActive: true
    },
    {
      name: "Demo School Staff",
      email: "staff@demoschool.com",
      passwordHash: await bcrypt.hash("staff123", 10),
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
      passwordHash: await bcrypt.hash("parent123", 10),
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
    status: "active" as const
  }));
  const buses = await Bus.insertMany(busPayload);
  console.log(`Created ${buses.length} buses`);

  console.log("Creating 30 students (no bus assignment on student record)...");
  const studentPayload = Array.from({ length: 30 }).map((_, index) => ({
    organizationId: orgId,
    name: `Student ${index + 1}`,
    grade: `${(index % 5) + 1}`,
    parentName: `Parent ${index + 1}`,
    parentPhone: `8000000${String(index).padStart(3, "0")}`.slice(-10),
    address: `Address for Student ${index + 1}`,
    status: "active" as const,
    academicYear: ACADEMIC_YEAR
  }));
  const students = await Student.insertMany(studentPayload);
  console.log(`Created ${students.length} students`);

  await User.findByIdAndUpdate(parent._id, {
    parentStudentIds: [students[0]._id, students[1]._id]
  });
  console.log("Linked parent to students 1 and 2");

  console.log("Creating transport registrations...");
  const transportAssignments: Array<{
    studentIndexes: number[];
    busIndex: number;
    fee: number;
    pickupStop?: string;
  }> = [
    { studentIndexes: [0, 1, 2, 3, 4], busIndex: 0, fee: 1500, pickupStop: "Koramangala" },
    { studentIndexes: [5, 6, 7, 8, 9], busIndex: 1, fee: 1500 },
    { studentIndexes: [10, 11, 12, 13, 14], busIndex: 2, fee: 1800 },
    { studentIndexes: [15, 16, 17], busIndex: 3, fee: 1500 },
    { studentIndexes: [20, 21, 22], busIndex: 4, fee: 1500 },
    { studentIndexes: [25, 26, 27], busIndex: 5, fee: 1500 }
  ];

  const transports = await StudentTransport.insertMany(
    transportAssignments.flatMap(({ studentIndexes, busIndex, fee, pickupStop }) =>
      studentIndexes.map((studentIndex) => ({
        organizationId: orgId,
        studentId: students[studentIndex]._id,
        busId: buses[busIndex]._id,
        monthlyTransportFee: fee,
        pickupStop,
        effectiveFrom: new Date("2025-04-01T00:00:00.000Z"),
        effectiveTo: null,
        status: "active" as const,
        academicYear: ACADEMIC_YEAR,
        addedBy: orgAdmin._id
      }))
    )
  );
  console.log(`Created ${transports.length} active transport records (18 on bus, 12 not using bus)`);

  const transportByStudent = new Map(
    transports.map((t) => [String(t.studentId), t])
  );

  console.log("Creating fee payments for transport-registered students...");
  const months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08"];
  const statusCycle: FeePaymentStatus[] = ["paid", "partial", "pending", "overdue"];

  const feePaymentPayload = transports.flatMap((transport, transportIndex) =>
    months.map((month, monthIndex) => {
      const status = statusCycle[(transportIndex + monthIndex) % statusCycle.length];
      const amount = transport.monthlyTransportFee;
      let amountPaid = 0;
      let paidAt: Date | undefined;
      let collectedBy;
      let notes: string | undefined;

      if (status === "paid") {
        amountPaid = amount;
        paidAt = new Date(`${month}-10T10:00:00.000Z`);
        collectedBy = orgAdmin._id;
      } else if (status === "partial") {
        amountPaid = Math.floor(amount * 0.5);
        paidAt = new Date(`${month}-12T10:00:00.000Z`);
        collectedBy = orgAdmin._id;
        notes = "Partial payment received in cash";
      } else if (status === "pending") {
        amountPaid = 0;
        notes = "Payment not collected yet";
      } else {
        amountPaid = 0;
        notes = "Overdue payment";
      }

      return {
        organizationId: orgId,
        studentId: transport.studentId,
        busId: transport.busId,
        transportId: transport._id,
        month,
        academicYear: ACADEMIC_YEAR,
        amount,
        amountPaid,
        status,
        paidAt,
        collectedBy,
        notes
      };
    })
  );
  await FeePayment.insertMany(feePaymentPayload);
  console.log(`Created ${feePaymentPayload.length} fee payment records`);

  console.log("Creating expenses...");
  const expensePayload = buses.flatMap((bus) => [
    {
      organizationId: orgId,
      busId: bus._id,
      category: "diesel" as const,
      amount: 9000,
      date: new Date("2025-04-05T10:00:00.000Z"),
      vendor: "Local Fuel Station",
      notes: "Monthly diesel refill",
      academicYear: ACADEMIC_YEAR,
      addedBy: orgAdmin._id
    },
    {
      organizationId: orgId,
      busId: bus._id,
      category: "maintenance" as const,
      amount: 3500,
      date: new Date("2025-04-15T10:00:00.000Z"),
      vendor: "City Auto Garage",
      notes: "Routine maintenance",
      academicYear: ACADEMIC_YEAR,
      addedBy: orgAdmin._id
    },
    {
      organizationId: orgId,
      busId: bus._id,
      category: "other" as const,
      amount: 1200,
      date: new Date("2025-04-20T10:00:00.000Z"),
      vendor: "Accessories Shop",
      notes: "Cleaning and accessories",
      academicYear: ACADEMIC_YEAR,
      addedBy: staff._id
    }
  ]);
  await Expense.insertMany(expensePayload);
  console.log(`Created ${expensePayload.length} expense records`);

  console.log("Creating school fee structure...");
  const feeStructure = await FeeStructure.create({
    organizationId: orgId,
    name: "Standard Fee Structure 2025-26",
    academicYear: ACADEMIC_YEAR,
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

  const assignResult = await assignFeeStructureToStudents(
    orgId,
    feeStructure,
    students.map((s) => s._id),
    ACADEMIC_YEAR
  );
  console.log(
    `Assigned fee structure to ${assignResult.assignments} students, ${assignResult.ledgerEntries} ledger entries created`
  );

  const student1 = students[0];
  const aprilLedger = await FeeLedger.findOne({
    studentId: student1._id,
    feeHeadName: "Tuition Fee",
    periodLabel: "2025-04",
    academicYear: ACADEMIC_YEAR
  });
  if (aprilLedger) {
    aprilLedger.amountPaid = aprilLedger.amountDue;
    aprilLedger.status = "paid";
    const samplePayment = await SchoolFeePayment.create({
      organizationId: orgId,
      studentId: student1._id,
      receiptNumber: "RCP-SEED-SAMPLE01",
      academicYear: ACADEMIC_YEAR,
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
    console.log("Created sample school fee payment for Student 1 (April tuition)");
  }

  void transportByStudent;

  console.log("\n--- Seed credentials ---");
  console.log("Super Admin: super@taksha.com / super123");
  console.log("Org Admin:   admin@demoschool.com / admin123");
  console.log("Staff:       staff@demoschool.com / staff123");
  console.log("Parent:      parent@demoschool.com / parent123");
  console.log(`Organization: ${demoSchool.name} (${demoSchool.code})`);
  console.log("Seeding completed successfully");
};

void seed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });

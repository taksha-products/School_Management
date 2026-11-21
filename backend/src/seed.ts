import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

// Prefer repo-root .env (Docker / local), fall back to backend/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

import { connectDB } from "./config/db";
import { Bus } from "./models/Bus";
import { Expense } from "./models/Expense";
import { FeeGroup } from "./models/FeeGroup";
import { FeeLedger } from "./models/FeeLedger";
import { FeePayment, type FeePaymentStatus } from "./models/FeePayment";
import { FeeStructure } from "./models/FeeStructure";
import { GpsDevice } from "./models/GpsDevice";
import { GpsLog } from "./models/GpsLog";
import { Organization } from "./models/Organization";
import { RefreshToken } from "./models/RefreshToken";
import { SchoolFeePayment } from "./models/SchoolFeePayment";
import { Student } from "./models/Student";
import { StudentFeeAssignment } from "./models/StudentFeeAssignment";
import { StudentTransport } from "./models/StudentTransport";
import { User } from "./models/User";
import { ensureParentAccountForStudent } from "./services/parentProvisioning";
import { assignFeeStructureToStudents } from "./utils/schoolFeeLedger";
import { getCurrentAcademicYear } from "./utils/academicYear";
import { encryptSecretForStorage, generateBackupCodes } from "./utils/totp";

const ACADEMIC_YEAR = getCurrentAcademicYear();
const START_YEAR = ACADEMIC_YEAR.slice(0, 4);
/** Base32 secret used for seeded super-admin 2FA in development/E2E. */
const SEED_SUPER_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

interface SeedStudentRow {
  admissionNo: string;
  name: string;
  grade: string;
  section: string;
  parentName: string;
  parentPhone: string;
  address: string;
}

/**
 * EDGE CASE A — One school, same parent, 2 different students (siblings).
 * Phone 9876500001 → Aarav + Anaya at Greenfield only (one parent User, two kids).
 *
 * EDGE CASE B — Two schools, same parent phone, 2 different students.
 * Phone 9876500001 → Aarav at Greenfield + Riya at Riverside
 * (two parent User accounts, one per org; OTP shows school picker).
 *
 * EDGE CASE C — Extra same-school siblings for regression (Reddy / Khan / Joshi / Krishnan).
 */
const GREENFIELD_STUDENTS: SeedStudentRow[] = [
  // --- EDGE A + B (Greenfield side): Rohit Sharma ---
  {
    admissionNo: "GF-2026-0001",
    name: "Aarav Sharma",
    grade: "1",
    section: "A",
    parentName: "Rohit Sharma",
    parentPhone: "9876500001",
    address: "12, 4th Cross, Koramangala, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0002",
    name: "Anaya Sharma",
    grade: "3",
    section: "B",
    parentName: "Rohit Sharma",
    parentPhone: "9876500001",
    address: "12, 4th Cross, Koramangala, Bengaluru"
  },
  // --- single-child parents ---
  {
    admissionNo: "GF-2026-0003",
    name: "Vihaan Patel",
    grade: "2",
    section: "A",
    parentName: "Meera Patel",
    parentPhone: "9876500002",
    address: "45, MG Road, Indiranagar, Bengaluru"
  },
  // --- EDGE C: same-school siblings ---
  {
    admissionNo: "GF-2026-0004",
    name: "Ishaan Reddy",
    grade: "4",
    section: "A",
    parentName: "Suresh Reddy",
    parentPhone: "9876500003",
    address: "8, 100 Feet Road, HSR Layout, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0005",
    name: "Saanvi Reddy",
    grade: "6",
    section: "B",
    parentName: "Suresh Reddy",
    parentPhone: "9876500003",
    address: "8, 100 Feet Road, HSR Layout, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0006",
    name: "Advait Nair",
    grade: "5",
    section: "A",
    parentName: "Lakshmi Nair",
    parentPhone: "9876500004",
    address: "22, JP Nagar 5th Phase, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0007",
    name: "Myra Iyer",
    grade: "7",
    section: "A",
    parentName: "Karthik Iyer",
    parentPhone: "9876500005",
    address: "3, Banashankari 2nd Stage, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0008",
    name: "Kabir Khan",
    grade: "8",
    section: "B",
    parentName: "Imran Khan",
    parentPhone: "9876500006",
    address: "19, Frazer Town, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0009",
    name: "Diya Khan",
    grade: "5",
    section: "C",
    parentName: "Imran Khan",
    parentPhone: "9876500006",
    address: "19, Frazer Town, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0010",
    name: "Arjun Menon",
    grade: "9",
    section: "A",
    parentName: "Priya Menon",
    parentPhone: "9876500007",
    address: "67, Whitefield Main Road, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0011",
    name: "Kiara Das",
    grade: "10",
    section: "A",
    parentName: "Amit Das",
    parentPhone: "9876500008",
    address: "14, Electronic City Phase 1, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0012",
    name: "Reyansh Gupta",
    grade: "6",
    section: "A",
    parentName: "Neha Gupta",
    parentPhone: "9876500009",
    address: "5, Malleswaram 18th Cross, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0013",
    name: "Aisha Begum",
    grade: "3",
    section: "A",
    parentName: "Farhan Begum",
    parentPhone: "9876500010",
    address: "31, Shivajinagar, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0014",
    name: "Vivaan Joshi",
    grade: "11",
    section: "A",
    parentName: "Ramesh Joshi",
    parentPhone: "9876500011",
    address: "9, Jayanagar 4th Block, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0015",
    name: "Pari Joshi",
    grade: "8",
    section: "A",
    parentName: "Ramesh Joshi",
    parentPhone: "9876500011",
    address: "9, Jayanagar 4th Block, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0016",
    name: "Shaurya Rao",
    grade: "12",
    section: "B",
    parentName: "Anita Rao",
    parentPhone: "9876500012",
    address: "2, Yelahanka New Town, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0017",
    name: "Navya Krishnan",
    grade: "4",
    section: "B",
    parentName: "Suresh Krishnan",
    parentPhone: "9876500013",
    address: "55, RT Nagar, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0018",
    name: "Dev Krishnan",
    grade: "2",
    section: "B",
    parentName: "Suresh Krishnan",
    parentPhone: "9876500013",
    address: "55, RT Nagar, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0019",
    name: "Anvi Shetty",
    grade: "7",
    section: "B",
    parentName: "Deepa Shetty",
    parentPhone: "9876500014",
    address: "18, Basavanagudi, Bengaluru"
  },
  {
    admissionNo: "GF-2026-0020",
    name: "Atharv Pillai",
    grade: "1",
    section: "B",
    parentName: "Vikram Pillai",
    parentPhone: "9876500015",
    address: "7, Hebbal Kempapura, Bengaluru"
  }
];

/**
 * Riverside Academy
 * EDGE B (Riverside side): different student Riya Sharma, same parent phone 9876500001
 * EDGE A at Riverside: Kavita Mehta has Tara + Om (siblings in one school)
 */
const RIVERSIDE_STUDENTS: SeedStudentRow[] = [
  {
    admissionNo: "RS-2026-0001",
    name: "Riya Sharma",
    grade: "2",
    section: "A",
    parentName: "Rohit Sharma",
    parentPhone: "9876500001",
    address: "12, 4th Cross, Koramangala, Bengaluru"
  },
  {
    admissionNo: "RS-2026-0002",
    name: "Tara Mehta",
    grade: "5",
    section: "A",
    parentName: "Kavita Mehta",
    parentPhone: "9876500100",
    address: "21, Cubbon Road, Bengaluru"
  },
  {
    admissionNo: "RS-2026-0003",
    name: "Om Mehta",
    grade: "3",
    section: "B",
    parentName: "Kavita Mehta",
    parentPhone: "9876500100",
    address: "21, Cubbon Road, Bengaluru"
  }
];

const schoolGrades = (): Array<{ label: string; sections: string[] }> =>
  Array.from({ length: 12 }, (_, i) => ({
    label: String(i + 1),
    sections: ["A", "B", "C"]
  }));

const clearAllData = async (): Promise<void> => {
  console.log("Clearing existing collections (including demo school data)...");
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
    SchoolFeePayment.deleteMany({}),
    RefreshToken.deleteMany({}),
    GpsDevice.deleteMany({}),
    GpsLog.deleteMany({})
  ]);
  console.log("Collections cleared");
};

const provisionParentsForStudents = async (
  organizationId: string,
  students: Array<{ _id: import("mongoose").Types.ObjectId; parentName: string; parentPhone: string }>
): Promise<void> => {
  for (const student of students) {
    const parent = await ensureParentAccountForStudent({
      organizationId,
      studentId: student._id,
      parentName: student.parentName,
      parentPhone: student.parentPhone
    });
    await Student.updateOne(
      { _id: student._id },
      { $set: { parentUserId: parent.parentUserId } }
    );
  }
};

const seed = async (): Promise<void> => {
  await connectDB();
  console.log("Connected to MongoDB");

  await clearAllData();

  console.log("Creating organizations...");
  const [greenfield, riverside] = await Organization.insertMany([
    {
      name: "Greenfield Public School",
      code: "greenfield",
      displayName: "Greenfield",
      brandColor: "#0F766E",
      address: "100, Outer Ring Road, Bengaluru",
      phone: "08041234567",
      email: "office@greenfield.school",
      plan: "pro",
      isActive: true,
      currentAcademicYear: ACADEMIC_YEAR,
      institutionType: "school",
      grades: schoolGrades(),
      features: {
        busManagement: true,
        gpsTracking: false,
        schoolFees: true,
        onlinePayments: true,
        parentPortal: true,
        bulkOperations: true,
        expenseTracking: true,
        whatsappNotifications: false,
        transportManagement: true
      }
    },
    {
      name: "Riverside Academy",
      code: "riverside",
      displayName: "Riverside",
      brandColor: "#1D4ED8",
      address: "50, Cubbon Park Road, Bengaluru",
      phone: "08049876543",
      email: "hello@riverside.academy",
      plan: "trial",
      isActive: true,
      currentAcademicYear: ACADEMIC_YEAR,
      institutionType: "school",
      grades: schoolGrades(),
      features: {
        busManagement: true,
        gpsTracking: false,
        schoolFees: true,
        onlinePayments: false,
        parentPortal: true,
        bulkOperations: true,
        expenseTracking: true,
        whatsappNotifications: false,
        transportManagement: true
      }
    }
  ]);
  console.log(`Organizations: ${greenfield.name}, ${riverside.name}`);

  console.log("Creating platform + school admin users...");
  const superAdminBackupCodes = await generateBackupCodes();
  const [superAdmin, greenfieldAdmin, greenfieldStaff] = await User.insertMany([
    {
      name: "Super Admin",
      email: "super@bustrack.com",
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
      name: "Greenfield Admin",
      email: "admin@greenfield.school",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "orgAdmin",
      organizationId: greenfield._id,
      isActive: true
    },
    {
      name: "Greenfield Fee Staff",
      email: "staff@greenfield.school",
      passwordHash: await bcrypt.hash("staff123", 10),
      role: "staff",
      organizationId: greenfield._id,
      staffPermissions: {
        canCollectFees: true,
        canManageStudents: true,
        canViewReports: true,
        canManageBuses: false
      },
      isActive: true
    }
  ]);

  await User.create({
    name: "Riverside Admin",
    email: "admin@riverside.academy",
    passwordHash: await bcrypt.hash("admin123", 10),
    role: "orgAdmin",
    organizationId: riverside._id,
    isActive: true
  });
  console.log("Admins/staff created");

  console.log("Creating buses for Greenfield...");
  const buses = await Bus.insertMany([
    {
      organizationId: greenfield._id,
      busNumber: "KA-01-GF-01",
      routeName: "Koramangala – School",
      driverName: "Ramesh Kumar",
      driverPhone: "9000010001",
      capacity: 40,
      status: "active"
    },
    {
      organizationId: greenfield._id,
      busNumber: "KA-01-GF-02",
      routeName: "Indiranagar – School",
      driverName: "Suresh Babu",
      driverPhone: "9000010002",
      capacity: 40,
      status: "active"
    },
    {
      organizationId: greenfield._id,
      busNumber: "KA-01-GF-03",
      routeName: "HSR / BTM – School",
      driverName: "Manoj Singh",
      driverPhone: "9000010003",
      capacity: 35,
      status: "active"
    },
    {
      organizationId: greenfield._id,
      busNumber: "KA-01-GF-04",
      routeName: "Whitefield – School",
      driverName: "Anil Yadav",
      driverPhone: "9000010004",
      capacity: 40,
      status: "active"
    }
  ]);

  console.log("Creating Greenfield students...");
  const greenfieldStudents = await Student.insertMany(
    GREENFIELD_STUDENTS.map((row) => ({
      organizationId: greenfield._id,
      admissionNo: row.admissionNo,
      name: row.name,
      grade: row.grade,
      section: row.section,
      parentName: row.parentName,
      parentPhone: row.parentPhone,
      address: row.address,
      status: "active" as const,
      academicYear: ACADEMIC_YEAR
    }))
  );
  await provisionParentsForStudents(
    greenfield._id.toString(),
    greenfieldStudents.map((s) => ({
      _id: s._id,
      parentName: s.parentName,
      parentPhone: s.parentPhone
    }))
  );
  console.log(`Greenfield: ${greenfieldStudents.length} students + parent accounts`);

  console.log("Creating Riverside students (includes shared parent phone 9876500001)...");
  const riversideStudents = await Student.insertMany(
    RIVERSIDE_STUDENTS.map((row) => ({
      organizationId: riverside._id,
      admissionNo: row.admissionNo,
      name: row.name,
      grade: row.grade,
      section: row.section,
      parentName: row.parentName,
      parentPhone: row.parentPhone,
      address: row.address,
      status: "active" as const,
      academicYear: ACADEMIC_YEAR
    }))
  );
  await provisionParentsForStudents(
    riverside._id.toString(),
    riversideStudents.map((s) => ({
      _id: s._id,
      parentName: s.parentName,
      parentPhone: s.parentPhone
    }))
  );
  console.log(`Riverside: ${riversideStudents.length} students + parent accounts`);

  console.log("Creating transport registrations...");
  const transportPlan: Array<{ studentIndexes: number[]; busIndex: number; fee: number; stop: string }> = [
    { studentIndexes: [0, 1, 2, 3, 4], busIndex: 0, fee: 1800, stop: "Koramangala Water Tank" },
    { studentIndexes: [5, 6, 7, 8], busIndex: 1, fee: 1700, stop: "Indiranagar 100 Feet" },
    { studentIndexes: [9, 10, 11, 12], busIndex: 2, fee: 1600, stop: "HSR BDA Complex" },
    { studentIndexes: [13, 14, 15], busIndex: 3, fee: 2000, stop: "Whitefield Forum" }
  ];

  const transports = await StudentTransport.insertMany(
    transportPlan.flatMap(({ studentIndexes, busIndex, fee, stop }) =>
      studentIndexes.map((studentIndex) => ({
        organizationId: greenfield._id,
        studentId: greenfieldStudents[studentIndex]._id,
        busId: buses[busIndex]._id,
        monthlyTransportFee: fee,
        pickupStop: stop,
        dropStop: stop,
        effectiveFrom: new Date(`${START_YEAR}-04-01T00:00:00.000Z`),
        effectiveTo: null,
        status: "active" as const,
        academicYear: ACADEMIC_YEAR,
        addedBy: greenfieldAdmin._id
      }))
    )
  );
  console.log(`Created ${transports.length} transport records`);

  console.log("Creating transport fee payments...");
  const months = [
    `${START_YEAR}-04`,
    `${START_YEAR}-05`,
    `${START_YEAR}-06`,
    `${START_YEAR}-07`,
    `${START_YEAR}-08`
  ];
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
        collectedBy = greenfieldAdmin._id;
      } else if (status === "partial") {
        amountPaid = Math.floor(amount * 0.5);
        paidAt = new Date(`${month}-12T10:00:00.000Z`);
        collectedBy = greenfieldStaff._id;
        notes = "Partial payment received in cash";
      } else if (status === "pending") {
        notes = "Payment not collected yet";
      } else {
        notes = "Overdue payment";
      }

      return {
        organizationId: greenfield._id,
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
        notes,
        paymentMode: "cash" as const,
        webhookVerified: false
      };
    })
  );
  await FeePayment.insertMany(feePaymentPayload);
  console.log(`Created ${feePaymentPayload.length} transport fee payments`);

  console.log("Creating expenses...");
  await Expense.insertMany(
    buses.flatMap((bus) => [
      {
        organizationId: greenfield._id,
        busId: bus._id,
        category: "diesel" as const,
        amount: 9500,
        date: new Date(`${START_YEAR}-04-05T10:00:00.000Z`),
        vendor: "Indian Oil – ORR",
        notes: "Monthly diesel",
        academicYear: ACADEMIC_YEAR,
        addedBy: greenfieldAdmin._id
      },
      {
        organizationId: greenfield._id,
        busId: bus._id,
        category: "maintenance" as const,
        amount: 4200,
        date: new Date(`${START_YEAR}-04-15T10:00:00.000Z`),
        vendor: "City Auto Care",
        notes: "Service + tyres check",
        academicYear: ACADEMIC_YEAR,
        addedBy: greenfieldAdmin._id
      }
    ])
  );

  console.log("Creating school fee structure + ledger...");
  const feeStructure = await FeeStructure.create({
    organizationId: greenfield._id,
    name: `Greenfield Standard ${ACADEMIC_YEAR}`,
    academicYear: ACADEMIC_YEAR,
    applicableGrades: [],
    feeHeads: [
      {
        name: "Tuition Fee",
        amount: 5500,
        frequency: "monthly",
        dueDay: 10,
        isOptional: false,
        category: "academic"
      },
      {
        name: "Lab Fee",
        amount: 2500,
        frequency: "quarterly",
        dueDay: 15,
        isOptional: false,
        category: "facility"
      },
      {
        name: "Sports Fee",
        amount: 2000,
        frequency: "annual",
        dueDay: 10,
        isOptional: true,
        category: "other"
      }
    ],
    isActive: true
  });

  const assignResult = await assignFeeStructureToStudents(
    greenfield._id,
    feeStructure,
    greenfieldStudents.map((s) => s._id),
    ACADEMIC_YEAR
  );
  console.log(
    `Assigned fees to ${assignResult.assignments} students (${assignResult.ledgerEntries} ledger rows)`
  );

  const aarav = greenfieldStudents[0];
  const aprilLedger = await FeeLedger.findOne({
    studentId: aarav._id,
    feeHeadName: "Tuition Fee",
    periodLabel: `${START_YEAR}-04`,
    academicYear: ACADEMIC_YEAR
  });
  if (aprilLedger) {
    aprilLedger.amountPaid = aprilLedger.amountDue;
    aprilLedger.status = "paid";
    const samplePayment = await SchoolFeePayment.create({
      organizationId: greenfield._id,
      studentId: aarav._id,
      receiptNumber: "RCP-GF-SEED-0001",
      academicYear: ACADEMIC_YEAR,
      paymentDate: new Date(`${START_YEAR}-04-08T10:00:00.000Z`),
      paymentMode: "cash",
      collectedBy: greenfieldStaff._id,
      feeHeadPayments: [
        {
          feeHeadName: "Tuition Fee",
          periodLabel: `${START_YEAR}-04`,
          amountDue: aprilLedger.amountDue,
          amountPaid: aprilLedger.amountDue,
          lateFee: 0,
          status: "paid"
        }
      ],
      totalAmountDue: aprilLedger.amountDue,
      totalAmountPaid: aprilLedger.amountDue,
      totalLateFee: 0,
      notes: "Seed sample — Aarav Sharma April tuition"
    });
    aprilLedger.paymentId = samplePayment._id;
    await aprilLedger.save();
  }

  void superAdmin;

  const rohitGreenfield = await User.findOne({
    phone: "9876500001",
    organizationId: greenfield._id,
    role: "parent"
  });
  const rohitRiverside = await User.findOne({
    phone: "9876500001",
    organizationId: riverside._id,
    role: "parent"
  });

  console.log("\n--- Seed complete ---");
  console.log("Super Admin:      super@bustrack.com / super123");
  console.log("Super Admin TOTP secret (Authenticator): " + SEED_SUPER_ADMIN_TOTP_SECRET);
  console.log(
    "Super Admin otpauth: otpauth://totp/EduNex:super@bustrack.com?secret=" +
      SEED_SUPER_ADMIN_TOTP_SECRET +
      "&issuer=EduNex"
  );
  console.log("Greenfield Admin: admin@greenfield.school / admin123");
  console.log("Greenfield Staff: staff@greenfield.school / staff123");
  console.log("Riverside Admin:  admin@riverside.academy / admin123");
  console.log(`Orgs: ${greenfield.code}, ${riverside.code}`);
  console.log("\n--- Edge cases ---");
  console.log("A) Same school, same parent, 2 students:");
  console.log("   phone 9876500001 @ greenfield → Aarav Sharma + Anaya Sharma");
  console.log("   phone 9876500100 @ riverside  → Tara Mehta + Om Mehta");
  console.log("B) Two schools, same parent phone, different students:");
  console.log("   phone 9876500001 → Aarav/Anaya (greenfield) + Riya Sharma (riverside)");
  console.log("   OTP verify → requiresSchoolSelection popup");
  console.log(
    `   Greenfield parentUserId: ${rohitGreenfield?._id?.toString() ?? "n/a"}`
  );
  console.log(
    `   Riverside parentUserId:  ${rohitRiverside?._id?.toString() ?? "n/a"}`
  );
};

void seed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });

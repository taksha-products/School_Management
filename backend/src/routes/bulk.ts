import { Router } from "express";
import type { Request, Response } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { requireFeature } from "../middleware/featureFlag";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { isOrgAdminOrStaff, canAccessOrg } from "../middleware/roleCheck";
import { uploadMemory } from "../middleware/upload";
import { Bus } from "../models/Bus";
import { Expense } from "../models/Expense";
import { FeeLedger } from "../models/FeeLedger";
import { FeePayment } from "../models/FeePayment";
import { FeeStructure } from "../models/FeeStructure";
import { Organization } from "../models/Organization";
import { Student } from "../models/Student";
import { StudentTransport } from "../models/StudentTransport";
import { StudentFeeAssignment } from "../models/StudentFeeAssignment";
import { asyncHandler } from "../utils/asyncHandler";
import {
  busCapacityExceededMessage,
  countActiveStudentsOnBus,
  wouldExceedBusCapacity
} from "../utils/busCapacity";
import { generateTemplate, parseExcelBuffer, type TemplateHeader } from "../utils/excelParser";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import {
  buildValidGradeSet,
  formatGradeValidationMessage,
  formatSectionValidationMessage,
  getSectionsForGrade,
  orgHasAnySections,
  resolveOrgGradeConfig,
  type OrgGradeConfig
} from "../utils/orgGradeConfig";
import { assignFeeStructureToStudents } from "../utils/schoolFeeLedger";
import {
  buildStudentFeeStatusMapsByYear,
  formatStudentFeeStatusLabel
} from "../services/schoolFeeService";
import type { IStudent } from "../models/Student";
import { getCurrentAcademicYear } from "../utils/academicYear";

const bulkRouter = Router();

const bulkGuard = [
  auth,
  orgScope,
  requireOrgScope,
  canAccessOrg,
  requireFeature("bulkOperations"),
  isOrgAdminOrStaff("canManageStudents")
] as const;

const buildStudentTemplateHeaders = (orgConfig: OrgGradeConfig): TemplateHeader[] => {
  const gradeExample = orgConfig.grades[0]?.label ?? "6";
  const includeSection = orgHasAnySections(orgConfig);
  const headers: TemplateHeader[] = [
    { key: "name", header: "Name", example: "Rahul Sharma" },
    { key: "grade", header: "Grade", example: gradeExample },
    ...(includeSection
      ? [{ key: "section", header: "Section", example: orgConfig.grades[0]?.sections[0] ?? "A" }]
      : []),
    { key: "parentName", header: "Parent Name", example: "Suresh Sharma" },
    { key: "parentPhone", header: "Parent Phone", example: "9876543210" },
    { key: "address", header: "Address", example: "123 MG Road, Bengaluru" },
    { key: "academicYear", header: "Academic Year", example: getCurrentAcademicYear() }
  ];
  return headers;
};

const transportTemplateHeaders: TemplateHeader[] = [
  { key: "studentName", header: "Student Name", example: "Rahul Sharma" },
  { key: "grade", header: "Grade", example: "6" },
  { key: "busNumber", header: "Bus Number", example: "Bus 1" },
  { key: "pickupStop", header: "Pickup Stop", example: "Koramangala" },
  { key: "dropStop", header: "Drop Stop", example: "Koramangala" },
  { key: "monthlyFee", header: "Monthly Fee", example: "1500" },
  { key: "effectiveFrom", header: "Effective From", example: `${getCurrentAcademicYear().slice(0, 4)}-04-01` }
];

type PreviewRow = {
  row: number;
  name: string;
  grade: string;
  section?: string;
  parentName: string;
  parentPhone: string;
  address?: string;
  academicYear: string;
  status: "valid" | "warning" | "error";
  issues: string[];
};

type TransportPreviewRow = {
  row: number;
  studentName: string;
  grade: string;
  busNumber: string;
  busId?: string;
  pickupStop?: string;
  dropStop?: string;
  monthlyFee: number;
  effectiveFrom: string;
  status: "valid" | "warning" | "error";
  issues: string[];
};

const trimString = (value: unknown): string => String(value ?? "").trim();
const toDateStamp = (): string => new Date().toISOString().slice(0, 10);

const runUploadMemory = (req: Request, res: Response): Promise<void> =>
  new Promise((resolve, reject) => {
    uploadMemory(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const getOrgGradeConfigById = async (orgId: string): Promise<OrgGradeConfig> => {
  const org = await Organization.findById(orgId).select("institutionType grades");
  if (!org) {
    throw new Error("Organization not found");
  }
  return resolveOrgGradeConfig(org);
};

const parseStudentImportRow = (
  row: Record<string, unknown>,
  rowNumber: number,
  orgConfig: OrgGradeConfig
) => {
  const validGrades = buildValidGradeSet(orgConfig.grades);

  const name = trimString(row.Name);
  const grade = trimString(row.Grade);
  const section = trimString(row.Section);
  const parentName = trimString(row["Parent Name"]);
  const parentPhone = trimString(row["Parent Phone"]);
  const address = trimString(row.Address);
  const academicYear = trimString(row["Academic Year"]);

  if (!name || name.length > 100) {
    throw new Error("Name is required and must be less than 100 characters");
  }
  if (!grade || !validGrades.has(grade)) {
    throw new Error(formatGradeValidationMessage(orgConfig.grades));
  }

  const gradeSections = getSectionsForGrade(orgConfig, grade);
  if (gradeSections.length > 0) {
    if (!section) {
      throw new Error(`Section is required for grade ${grade}`);
    }
    if (!gradeSections.includes(section)) {
      throw new Error(formatSectionValidationMessage(gradeSections));
    }
  } else if (section) {
    throw new Error(`Section is not used for grade ${grade}`);
  }
  if (!parentName) {
    throw new Error("Parent Name is required");
  }
  if (!/^\d{10}$/.test(parentPhone)) {
    throw new Error("Parent Phone must be 10 digits");
  }
  if (!/^\d{4}-\d{2}$/.test(academicYear)) {
    throw new Error("Academic Year must be in YYYY-YY format");
  }

  return {
    row: rowNumber,
    name,
    grade,
    section: gradeSections.length > 0 ? section : undefined,
    parentName,
    parentPhone,
    address: address || undefined,
    academicYear
  };
};

const parseTransportImportRow = (
  row: Record<string, unknown>,
  rowNumber: number,
  busMap: Map<string, string>,
  orgConfig: OrgGradeConfig
) => {
  const validGrades = buildValidGradeSet(orgConfig.grades);

  const studentName = trimString(row["Student Name"]);
  const grade = trimString(row.Grade);
  const busNumber = trimString(row["Bus Number"]);
  const pickupStop = trimString(row["Pickup Stop"]);
  const dropStop = trimString(row["Drop Stop"]);
  const monthlyFeeRaw = trimString(row["Monthly Fee"]);
  const effectiveFromRaw = trimString(row["Effective From"]);

  if (!studentName) {
    throw new Error("Student Name is required");
  }
  if (!grade || !validGrades.has(grade)) {
    throw new Error(formatGradeValidationMessage(orgConfig.grades));
  }
  if (!busNumber || !busMap.has(busNumber)) {
    throw new Error(busNumber ? `${busNumber} not found` : "Bus Number is required");
  }

  const monthlyFee = monthlyFeeRaw ? Number(monthlyFeeRaw) : 1500;
  if (Number.isNaN(monthlyFee) || monthlyFee < 0) {
    throw new Error("Monthly Fee must be a number >= 0");
  }

  let effectiveFrom = new Date().toISOString().slice(0, 10);
  if (effectiveFromRaw) {
    const parsed = new Date(effectiveFromRaw);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Effective From must be a valid date");
    }
    effectiveFrom = parsed.toISOString().slice(0, 10);
  }

  return {
    row: rowNumber,
    studentName,
    grade,
    busNumber,
    busId: busMap.get(busNumber),
    pickupStop: pickupStop || undefined,
    dropStop: dropStop || undefined,
    monthlyFee,
    effectiveFrom
  };
};

const getOrgName = async (orgId: string): Promise<string> => {
  const org = await Organization.findById(orgId).select("name");
  return org?.name ? `${org.name} (${toDateStamp()})` : `TAKSHA Export (${toDateStamp()})`;
};

bulkRouter.get(
  "/templates/students",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const orgConfig = await getOrgGradeConfigById(orgId);
    const file = generateTemplate(buildStudentTemplateHeaders(orgConfig), "Students Template");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="student_upload_template.xlsx"'
    );
    res.send(file);
  })
);

bulkRouter.post(
  "/students/preview",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    await runUploadMemory(req, res);
    const authReq = req as AuthenticatedRequest & { file?: Express.Multer.File };
    if (!authReq.file?.buffer) {
      res.status(400).json({ success: false, data: null, message: "File is required" });
      return;
    }

    const orgId = getScopedOrganizationId(authReq, res)!;
    const orgConfig = await getOrgGradeConfigById(orgId);

    const parsed = parseExcelBuffer(authReq.file.buffer, (row, rowIndex) =>
      parseStudentImportRow(row, rowIndex, orgConfig)
    );

    const existingStudents = await Student.find({
      organizationId: new Types.ObjectId(orgId)
    }).select("name grade");
    const dbDuplicateSet = new Set(
      existingStudents.map((student) => `${student.name.toLowerCase()}|${student.grade}`)
    );

    const fileDuplicateSet = new Set<string>();
    const preview: PreviewRow[] = parsed.rows.map((item) => {
      const duplicateKey = `${item.name.toLowerCase()}|${item.grade}|${item.parentPhone}`;
      const issues: string[] = [];
      let status: PreviewRow["status"] = "valid";

      if (fileDuplicateSet.has(duplicateKey)) {
        status = "error";
        issues.push("Duplicate within file");
      } else {
        fileDuplicateSet.add(duplicateKey);
      }

      const dbKey = `${item.name.toLowerCase()}|${item.grade}`;
      if (dbDuplicateSet.has(dbKey) && status !== "error") {
        status = "warning";
        issues.push("Possible duplicate");
      }

      return {
        ...item,
        status,
        issues
      };
    });

    const errors: { row: number; message: string }[] = [
      ...parsed.errors,
      ...preview
        .filter((row) => row.status === "error")
        .map((row) => ({ row: row.row, message: row.issues.join(", ") }))
    ];

    const summary = {
      total: parsed.totalRows,
      valid: preview.filter((row) => row.status === "valid").length,
      warnings: preview.filter((row) => row.status === "warning").length,
      errors: errors.length
    };

    res.json({
      success: true,
      data: {
        preview,
        summary,
        errors
      }
    });
  })
);

bulkRouter.post(
  "/students/confirm",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { rows, skipWarnings, academicYear } = req.body as {
      rows?: PreviewRow[];
      skipWarnings?: boolean;
      academicYear?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0 || !academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "rows[] and academicYear are required"
      });
      return;
    }

    const orgConfig = await getOrgGradeConfigById(orgId);

    const eligibleRows = rows.filter(
      (row) => row.status === "valid" || (!skipWarnings && row.status === "warning")
    );

    const failures: Array<{ row: number; name: string; reason: string }> = [];
    const toInsert = eligibleRows
      .map((row) => {
        try {
          const validated = parseStudentImportRow(
            {
              Name: row.name,
              Grade: row.grade,
              Section: row.section ?? "",
              "Parent Name": row.parentName,
              "Parent Phone": row.parentPhone,
              Address: row.address ?? "",
              "Academic Year": academicYear
            },
            row.row,
            orgConfig
          );
          return {
            organizationId: new Types.ObjectId(orgId),
            name: validated.name,
            grade: validated.grade,
            section: validated.section,
            parentName: validated.parentName,
            parentPhone: validated.parentPhone,
            address: validated.address,
            status: "active" as const,
            academicYear
          };
        } catch (error) {
          failures.push({
            row: row.row,
            name: row.name,
            reason: error instanceof Error ? error.message : "Invalid row"
          });
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (toInsert.length === 0) {
      res.json({
        success: true,
        data: { created: 0, skipped: rows.length, failed: failures.length, failures }
      });
      return;
    }

    let insertedDocsCount = 0;
    try {
      const inserted = await Student.insertMany(toInsert, { ordered: false });
      insertedDocsCount = inserted.length;
    } catch (error: unknown) {
      const bulkError = error as {
        insertedDocs?: unknown[];
        writeErrors?: Array<{ index: number; err?: { errmsg?: string }; errmsg?: string }>;
      };
      insertedDocsCount = bulkError.insertedDocs?.length ?? 0;
      for (const writeError of bulkError.writeErrors ?? []) {
        const payload = toInsert[writeError.index];
        failures.push({
          row: eligibleRows[writeError.index]?.row ?? writeError.index + 2,
          name: payload?.name ?? "Unknown",
          reason: writeError.err?.errmsg ?? writeError.errmsg ?? "Insert failed"
        });
      }
    }

    res.json({
      success: true,
      data: {
        created: insertedDocsCount,
        skipped: rows.length - eligibleRows.length,
        failed: failures.length,
        failures
      }
    });
  })
);

bulkRouter.post(
  "/students/assign-bus",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { studentIds, busId, academicYear, monthlyTransportFee, pickupStop, effectiveFrom } =
      req.body as {
        studentIds?: string[];
        busId?: string;
        academicYear?: string;
        monthlyTransportFee?: number;
        pickupStop?: string;
        effectiveFrom?: string;
      };

    if (!Array.isArray(studentIds) || studentIds.length === 0 || !busId || !academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "studentIds[], busId, and academicYear are required"
      });
      return;
    }
    if (studentIds.length > 200) {
      res.status(400).json({ success: false, data: null, message: "Maximum 200 students per request" });
      return;
    }
    if (!Types.ObjectId.isValid(busId)) {
      res.status(400).json({ success: false, data: null, message: "Invalid busId" });
      return;
    }

    const bus = await Bus.findOne({
      _id: busId,
      organizationId: new Types.ObjectId(orgId),
      status: "active"
    });
    if (!bus) {
      res.status(404).json({ success: false, data: null, message: "Active bus not found for organization" });
      return;
    }

    const objectIds = studentIds.filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id));
    const students = await Student.find({
      _id: { $in: objectIds },
      organizationId: new Types.ObjectId(orgId)
    }).select("_id");

    const foundIds = new Set(students.map((student) => student._id.toString()));
    const notFound = objectIds.filter((id) => !foundIds.has(id.toString())).length;

    const activeOnBus = await countActiveStudentsOnBus(orgId, bus._id);
    const existingTransports = await StudentTransport.find({
      organizationId: new Types.ObjectId(orgId),
      studentId: { $in: students.map((student) => student._id) },
      status: "active"
    }).select("studentId");
    const studentsWithTransport = new Set(
      existingTransports.map((transport) => transport.studentId.toString())
    );
    const seatsNeeded = students.filter(
      (student) => !studentsWithTransport.has(student._id.toString())
    ).length;

    if (wouldExceedBusCapacity(bus.capacity, activeOnBus, seatsNeeded)) {
      res.status(400).json({
        success: false,
        data: null,
        message: busCapacityExceededMessage(
          bus.busNumber,
          bus.capacity,
          activeOnBus,
          seatsNeeded
        )
      });
      return;
    }

    const fee = Number(monthlyTransportFee ?? 1500);
    const effectiveFromDate = effectiveFrom ? new Date(effectiveFrom) : new Date();
    let created = 0;
    let skipped = 0;
    const failures: Array<{ studentId: string; reason: string }> = [];

    for (const student of students) {
      if (studentsWithTransport.has(student._id.toString())) {
        skipped += 1;
        failures.push({
          studentId: student._id.toString(),
          reason: "Student already has active transport"
        });
        continue;
      }

      await StudentTransport.create({
        organizationId: new Types.ObjectId(orgId),
        studentId: student._id,
        busId: bus._id,
        monthlyTransportFee: fee,
        pickupStop: pickupStop?.trim(),
        effectiveFrom: effectiveFromDate,
        effectiveTo: null,
        status: "active",
        academicYear,
        addedBy: authReq.user?.userId ? new Types.ObjectId(authReq.user.userId) : undefined
      });
      created += 1;
    }

    res.json({
      success: true,
      data: {
        created,
        skipped,
        failed: notFound + failures.length,
        failures
      },
      message: "Transport assignment completed"
    });
  })
);

bulkRouter.post(
  "/students/assign-bus-by-grade",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { grade, section, busId, academicYear, monthlyTransportFee, pickupStop, effectiveFrom } =
      req.body as {
        grade?: string;
        section?: string;
        busId?: string;
        academicYear?: string;
        monthlyTransportFee?: number;
        pickupStop?: string;
        effectiveFrom?: string;
      };

    if (!grade || !busId || !academicYear || !Types.ObjectId.isValid(busId)) {
      res.status(400).json({
        success: false,
        data: null,
        message: "grade, academicYear, and valid busId are required"
      });
      return;
    }

    const bus = await Bus.findOne({
      _id: busId,
      organizationId: new Types.ObjectId(orgId),
      status: "active"
    });
    if (!bus) {
      res.status(404).json({ success: false, data: null, message: "Active bus not found" });
      return;
    }

    const studentFilter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(orgId),
      status: "active",
      grade
    };
    const sectionFilter = typeof section === "string" ? section.trim() : "";
    if (sectionFilter) {
      studentFilter.section = sectionFilter;
    }

    const gradeStudents = await Student.find(studentFilter).select("_id");

    const activeOnBus = await countActiveStudentsOnBus(orgId, bus._id);
    const existingTransports = await StudentTransport.find({
      organizationId: new Types.ObjectId(orgId),
      studentId: { $in: gradeStudents.map((student) => student._id) },
      status: "active"
    }).select("studentId");
    const studentsWithTransport = new Set(
      existingTransports.map((transport) => transport.studentId.toString())
    );
    const seatsNeeded = gradeStudents.filter(
      (student) => !studentsWithTransport.has(student._id.toString())
    ).length;

    if (wouldExceedBusCapacity(bus.capacity, activeOnBus, seatsNeeded)) {
      res.status(400).json({
        success: false,
        data: null,
        message: busCapacityExceededMessage(
          bus.busNumber,
          bus.capacity,
          activeOnBus,
          seatsNeeded
        )
      });
      return;
    }

    const fee = Number(monthlyTransportFee ?? 1500);
    const effectiveFromDate = effectiveFrom ? new Date(effectiveFrom) : new Date();
    let created = 0;
    let skipped = 0;

    for (const student of gradeStudents) {
      if (studentsWithTransport.has(student._id.toString())) {
        skipped += 1;
        continue;
      }
      await StudentTransport.create({
        organizationId: new Types.ObjectId(orgId),
        studentId: student._id,
        busId: bus._id,
        monthlyTransportFee: fee,
        pickupStop: pickupStop?.trim(),
        effectiveFrom: effectiveFromDate,
        status: "active",
        academicYear
      });
      created += 1;
    }

    res.json({ success: true, data: { created, skipped } });
  })
);

bulkRouter.get("/templates/transport", asyncHandler(async (_req, res) => {
  const file = generateTemplate(transportTemplateHeaders, "Transport Template");
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="transport_upload_template.xlsx"'
  );
  res.send(file);
}));

bulkRouter.post(
  "/transport/preview",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    await runUploadMemory(req, res);
    const authReq = req as AuthenticatedRequest & { file?: Express.Multer.File };
    if (!authReq.file?.buffer) {
      res.status(400).json({ success: false, data: null, message: "File is required" });
      return;
    }

    const orgId = getScopedOrganizationId(authReq, res)!;
    const orgConfig = await getOrgGradeConfigById(orgId);
    const buses = await Bus.find({
      organizationId: new Types.ObjectId(orgId),
      status: "active"
    }).select("busNumber");
    const busMap = new Map<string, string>(buses.map((bus) => [bus.busNumber, bus._id.toString()]));

    const parsed = parseExcelBuffer(authReq.file.buffer, (row, rowIndex) =>
      parseTransportImportRow(row, rowIndex, busMap, orgConfig)
    );

    const orgStudents = await Student.find({
      organizationId: new Types.ObjectId(orgId),
      status: "active"
    }).select("name grade _id");

    const activeTransports = await StudentTransport.find({
      organizationId: new Types.ObjectId(orgId),
      status: "active"
    }).select("studentId");
    const activeStudentIds = new Set(activeTransports.map((t) => String(t.studentId)));

    const preview: TransportPreviewRow[] = parsed.rows.map((item) => {
      const matches = orgStudents.filter(
        (s) =>
          s.name.toLowerCase() === item.studentName.toLowerCase() && s.grade === item.grade
      );
      const issues: string[] = [];
      let status: TransportPreviewRow["status"] = "valid";

      if (matches.length === 0) {
        status = "error";
        issues.push("Student not found");
      } else if (matches.length > 1) {
        status = "error";
        issues.push("Multiple students match, use student ID column to disambiguate");
      } else if (activeStudentIds.has(String(matches[0]._id))) {
        status = "warning";
        issues.push("Student already has active transport");
      }

      return {
        ...item,
        status,
        issues
      };
    });

    const errors: { row: number; message: string }[] = [
      ...parsed.errors,
      ...preview
        .filter((row) => row.status === "error")
        .map((row) => ({ row: row.row, message: row.issues.join(", ") }))
    ];

    res.json({
      success: true,
      data: {
        preview,
        summary: {
          total: parsed.totalRows,
          valid: preview.filter((row) => row.status === "valid").length,
          warnings: preview.filter((row) => row.status === "warning").length,
          errors: errors.length
        },
        errors
      }
    });
  })
);

bulkRouter.post(
  "/transport/confirm",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { rows, skipWarnings, academicYear } = req.body as {
      rows?: TransportPreviewRow[];
      skipWarnings?: boolean;
      academicYear?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0 || !academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "rows[] and academicYear are required"
      });
      return;
    }

    const eligibleRows = rows.filter(
      (row) => row.status === "valid" || (!skipWarnings && row.status === "warning")
    );

    let created = 0;
    let skipped = 0;
    const failures: Array<{ row: number; name: string; reason: string }> = [];

    for (const row of eligibleRows) {
      const matches = await Student.find({
        organizationId: new Types.ObjectId(orgId),
        status: "active",
        name: new RegExp(`^${row.studentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        grade: row.grade
      });

      if (matches.length !== 1) {
        failures.push({
          row: row.row,
          name: row.studentName,
          reason:
            matches.length === 0
              ? "Student not found"
              : "Multiple students match, use student ID column to disambiguate"
        });
        continue;
      }

      const student = matches[0];
      const existing = await StudentTransport.findOne({
        organizationId: new Types.ObjectId(orgId),
        studentId: student._id,
        status: "active"
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      if (!row.busId || !Types.ObjectId.isValid(row.busId)) {
        failures.push({ row: row.row, name: row.studentName, reason: "Invalid bus" });
        continue;
      }

      await StudentTransport.create({
        organizationId: new Types.ObjectId(orgId),
        studentId: student._id,
        busId: new Types.ObjectId(row.busId),
        monthlyTransportFee: row.monthlyFee,
        pickupStop: row.pickupStop,
        dropStop: row.dropStop,
        effectiveFrom: new Date(row.effectiveFrom),
        status: "active",
        academicYear,
        addedBy: authReq.user?.userId ? new Types.ObjectId(authReq.user.userId) : undefined
      });
      created += 1;
    }

    res.json({
      success: true,
      data: {
        created,
        skipped: rows.length - eligibleRows.length + skipped,
        failed: failures.length,
        failures
      }
    });
  })
);

bulkRouter.post(
  "/fees/mark-paid",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { paymentIds, notes } = req.body as {
      paymentIds?: string[];
      paymentMode?: "cash";
      notes?: string;
    };

    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      res.status(400).json({ success: false, data: null, message: "paymentIds[] are required" });
      return;
    }
    if (paymentIds.length > 100) {
      res.status(400).json({ success: false, data: null, message: "Maximum 100 payments per request" });
      return;
    }

    const objectIds = paymentIds.filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id));
    const payments = await FeePayment.find({
      _id: { $in: objectIds },
      organizationId: new Types.ObjectId(orgId)
    });

    const alreadyPaidIds = new Set(
      payments
        .filter((payment) => payment.status === "paid")
        .map((payment) => payment._id.toString())
    );

    const markableIds = payments
      .filter((payment) => payment.status !== "paid")
      .map((payment) => payment._id);

    const result = await FeePayment.updateMany(
      { _id: { $in: markableIds } },
      {
        $set: {
          status: "paid",
          paidAt: new Date(),
          collectedBy: authReq.user?.userId ? new Types.ObjectId(authReq.user.userId) : undefined,
          notes
        }
      }
    );

    for (const payment of payments) {
      if (!alreadyPaidIds.has(payment._id.toString())) {
        payment.amountPaid = payment.amount;
        await payment.save();
      }
    }

    res.json({
      success: true,
      data: {
        marked: result.modifiedCount,
        alreadyPaid: alreadyPaidIds.size
      }
    });
  })
);

bulkRouter.post(
  "/fees/assign-structure",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { feeStructureId, grades, academicYear, overwriteExisting } = req.body as {
      feeStructureId?: string;
      grades?: string[];
      academicYear?: string;
      overwriteExisting?: boolean;
    };

    if (!feeStructureId || !Types.ObjectId.isValid(feeStructureId) || !academicYear || !Array.isArray(grades)) {
      res.status(400).json({
        success: false,
        data: null,
        message: "feeStructureId, grades[] and academicYear are required"
      });
      return;
    }

    const feeStructure = await FeeStructure.findOne({
      _id: feeStructureId,
      ...orgFilter(authReq, res),
      isActive: true
    });
    if (!feeStructure) {
      res.status(404).json({ success: false, data: null, message: "Active fee structure not found" });
      return;
    }

    const students = await Student.find({
      organizationId: new Types.ObjectId(orgId),
      status: "active",
      grade: { $in: grades }
    }).select("_id");

    const existingAssignments = await StudentFeeAssignment.find({
      organizationId: new Types.ObjectId(orgId),
      studentId: { $in: students.map((student) => student._id) },
      academicYear
    }).select("studentId");
    const existingSet = new Set(existingAssignments.map((item) => item.studentId.toString()));

    const eligibleStudentIds = students
      .map((student) => student._id)
      .filter((studentId) => overwriteExisting || !existingSet.has(studentId.toString()));

    const skipped = students.length - eligibleStudentIds.length;
    const assignedResult = await assignFeeStructureToStudents(
      new Types.ObjectId(orgId),
      feeStructure,
      eligibleStudentIds,
      academicYear
    );

    res.json({
      success: true,
      data: {
        assigned: assignedResult.assignments,
        skipped,
        ledgerEntriesCreated: assignedResult.ledgerEntries
      }
    });
  })
);

bulkRouter.post(
  "/students/promote",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { academicYear, promotionMap, preview } = req.body as {
      academicYear?: string;
      promotionMap?: Record<string, string>;
      preview?: boolean;
    };

    if (!academicYear || !promotionMap) {
      res.status(400).json({ success: false, data: null, message: "academicYear and promotionMap are required" });
      return;
    }

    const students = await Student.find({
      organizationId: new Types.ObjectId(orgId),
      status: "active"
    }).select("_id grade");

    const byGrade = new Map<string, Types.ObjectId[]>();
    for (const student of students) {
      const nextGrade = promotionMap[student.grade];
      if (!nextGrade) {
        continue;
      }
      if (!byGrade.has(student.grade)) {
        byGrade.set(student.grade, []);
      }
      byGrade.get(student.grade)!.push(student._id);
    }

    const gradeSummary = Array.from(byGrade.entries()).map(([from, ids]) => ({
      from,
      to: promotionMap[from],
      count: ids.length
    }));
    const graduating = gradeSummary
      .filter((row) => row.to === "graduate")
      .reduce((acc, row) => acc + row.count, 0);
    const totalAffected = gradeSummary.reduce((acc, row) => acc + row.count, 0);

    if (preview) {
      res.json({
        success: true,
        data: {
          byGrade: gradeSummary,
          graduating,
          totalAffected
        }
      });
      return;
    }

    let promoted = 0;
    let graduated = 0;
    for (const [fromGrade, ids] of byGrade.entries()) {
      const toGrade = promotionMap[fromGrade];
      if (toGrade === "graduate") {
        const result = await Student.updateMany(
          { _id: { $in: ids }, organizationId: new Types.ObjectId(orgId) },
          { $set: { status: "inactive", academicYear } }
        );
        graduated += result.modifiedCount;
      } else {
        const result = await Student.updateMany(
          { _id: { $in: ids }, organizationId: new Types.ObjectId(orgId) },
          { $set: { grade: toGrade, academicYear } }
        );
        promoted += result.modifiedCount;
      }
    }

    res.json({
      success: true,
      data: {
        promoted,
        graduated
      }
    });
  })
);

bulkRouter.get(
  "/export/students",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { grade, section, busId, status, academicYear } = req.query as Record<
      string,
      string | undefined
    >;

    const filter: Record<string, unknown> = { ...orgFilter(authReq, res) };
    if (grade) filter.grade = grade;
    if (section) filter.section = section;
    if (status) filter.status = status;
    if (academicYear) filter.academicYear = academicYear;

    if (busId && Types.ObjectId.isValid(busId)) {
      const transports = await StudentTransport.find({
        ...orgFilter(authReq, res),
        busId: new Types.ObjectId(busId),
        status: "active"
      }).select("studentId");
      filter._id = { $in: transports.map((t) => t.studentId) };
    }

    const students = await Student.find(filter);
    const activeTransports = await StudentTransport.find({
      ...orgFilter(authReq, res),
      studentId: { $in: students.map((s) => s._id) },
      status: "active"
    })
      .populate("busId", "busNumber")
      .select("studentId busId monthlyTransportFee pickupStop");

    const transportByStudent = new Map(
      activeTransports.map((t) => [String(t.studentId), t])
    );

    const feeStatusByYear = await buildStudentFeeStatusMapsByYear(
      orgId,
      students.map((student) => student.academicYear)
    );

    interface StudentExportRow extends Record<string, unknown> {
      admissionNo: string;
      name: string;
      grade: string;
      section: string;
      status: string;
      academicYear: string;
      parentName: string;
      parentPhone: string;
      address: string;
      bus: string;
      pickupStop: string;
      monthlyBusFee: number | string;
      feeStatus: string;
      outstandingAmount: number;
    }

    const rows: StudentExportRow[] = students.map((student: IStudent) => {
      const transport = transportByStudent.get(String(student._id));
      const bus = transport?.busId as { busNumber?: string } | undefined;
      const yearStatusMap = feeStatusByYear.get(student.academicYear) ?? {};
      const feeLabels = formatStudentFeeStatusLabel(yearStatusMap[String(student._id)]);

      return {
        admissionNo: student.admissionNo ?? "",
        name: student.name,
        grade: student.grade,
        section: student.section ?? "",
        status: student.status,
        academicYear: student.academicYear,
        parentName: student.parentName,
        parentPhone: student.parentPhone,
        address: student.address ?? "",
        bus: bus?.busNumber ?? "",
        pickupStop: transport?.pickupStop ?? "",
        monthlyBusFee: transport?.monthlyTransportFee ?? "",
        feeStatus: feeLabels.feeStatus,
        outstandingAmount: feeLabels.outstandingAmount
      };
    });

    const headers: TemplateHeader[] = [
      { key: "admissionNo", header: "Admission No", example: "" },
      { key: "name", header: "Name", example: "" },
      { key: "grade", header: "Grade", example: "" },
      { key: "section", header: "Section", example: "" },
      { key: "status", header: "Status", example: "" },
      { key: "academicYear", header: "Academic Year", example: "" },
      { key: "parentName", header: "Parent Name", example: "" },
      { key: "parentPhone", header: "Parent Phone", example: "" },
      { key: "address", header: "Address", example: "" },
      { key: "bus", header: "Bus", example: "" },
      { key: "pickupStop", header: "Pickup Stop", example: "" },
      { key: "monthlyBusFee", header: "Monthly Bus Fee", example: "" },
      { key: "feeStatus", header: "Fee Status", example: "" },
      { key: "outstandingAmount", header: "Outstanding Amount", example: "" }
    ];
    const file = generateTemplate(headers, "Students", rows, await getOrgName(orgId));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="taksha_students_${toDateStamp()}.xlsx"`);
    res.send(file);
  })
);

bulkRouter.get(
  "/export/fees",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { month, busId, status, academicYear } = req.query as Record<string, string | undefined>;

    const filter: Record<string, unknown> = { ...orgFilter(authReq, res) };
    if (month) filter.month = month;
    if (busId && Types.ObjectId.isValid(busId)) filter.busId = new Types.ObjectId(busId);
    if (status) filter.status = status;
    if (academicYear) filter.academicYear = academicYear;

    const payments = await FeePayment.find(filter)
      .populate("studentId", "name grade")
      .populate("busId", "busNumber")
      .populate("collectedBy", "name");

    const rows = payments.map((payment) => ({
      studentName:
        (payment.studentId as unknown as { name?: string } | undefined)?.name ?? "",
      grade:
        (payment.studentId as unknown as { grade?: string } | undefined)?.grade ?? "",
      bus:
        (payment.busId as unknown as { busNumber?: string } | undefined)?.busNumber ?? "",
      feeDue: payment.amount,
      amountPaid: payment.amountPaid,
      status: payment.status,
      paidDate: payment.paidAt ? payment.paidAt.toISOString().slice(0, 10) : "",
      collectedBy:
        (payment.collectedBy as unknown as { name?: string } | undefined)?.name ??
        "",
      receiptNumber: payment._id.toString()
    }));
    const headers: TemplateHeader[] = [
      { key: "studentName", header: "Student Name", example: "" },
      { key: "grade", header: "Grade", example: "" },
      { key: "bus", header: "Bus", example: "" },
      { key: "feeDue", header: "Fee Due", example: "" },
      { key: "amountPaid", header: "Amount Paid", example: "" },
      { key: "status", header: "Status", example: "" },
      { key: "paidDate", header: "Paid Date", example: "" },
      { key: "collectedBy", header: "Collected By", example: "" },
      { key: "receiptNumber", header: "Receipt Number", example: "" }
    ];

    const file = generateTemplate(headers, "Bus Fees", rows, await getOrgName(orgId));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="taksha_fees_${toDateStamp()}.xlsx"`);
    res.send(file);
  })
);

bulkRouter.get(
  "/export/school-fees-outstanding",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { grade, academicYear } = req.query as Record<string, string | undefined>;

    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(orgId),
      status: { $in: ["pending", "partial", "overdue"] }
    };
    if (academicYear) filter.academicYear = academicYear;

    const ledgers = await FeeLedger.find(filter).populate("studentId", "name grade");
    const rows = ledgers
      .filter((ledger) => {
        const student = ledger.studentId as unknown as { grade?: string };
        if (!grade) return true;
        return student?.grade === grade;
      })
      .map((ledger) => {
        const student = ledger.studentId as unknown as { name?: string; grade?: string };
        return {
          studentName: student?.name ?? "",
          grade: student?.grade ?? "",
          feeHead: ledger.feeHeadName,
          period: ledger.periodLabel,
          amountDue: ledger.amountDue,
          amountPaid: ledger.amountPaid,
          balance: Math.max(0, ledger.amountDue + ledger.lateFee - ledger.amountPaid),
          status: ledger.status,
          dueDate: ledger.dueDate ? ledger.dueDate.toISOString().slice(0, 10) : ""
        };
      });
    const headers: TemplateHeader[] = [
      { key: "studentName", header: "Student Name", example: "" },
      { key: "grade", header: "Grade", example: "" },
      { key: "feeHead", header: "Fee Head", example: "" },
      { key: "period", header: "Period", example: "" },
      { key: "amountDue", header: "Amount Due", example: "" },
      { key: "amountPaid", header: "Amount Paid", example: "" },
      { key: "balance", header: "Balance", example: "" },
      { key: "status", header: "Status", example: "" },
      { key: "dueDate", header: "Due Date", example: "" }
    ];

    const file = generateTemplate(headers, "School Fees Outstanding", rows, await getOrgName(orgId));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="taksha_school_fees_outstanding_${toDateStamp()}.xlsx"`
    );
    res.send(file);
  })
);

bulkRouter.get(
  "/export/expenses",
  ...bulkGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { month, busId, category, academicYear } = req.query as Record<string, string | undefined>;

    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(orgId),
      deleted: { $ne: true }
    };
    if (busId && Types.ObjectId.isValid(busId)) filter.busId = new Types.ObjectId(busId);
    if (category) filter.category = category;
    if (academicYear) filter.academicYear = academicYear;
    if (month) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      filter.date = { $gte: start, $lt: end };
    }

    const expenses = await Expense.find(filter).populate("busId", "busNumber").populate("addedBy", "name");
    const rows = expenses.map((expense) => ({
      date: expense.date.toISOString().slice(0, 10),
      bus:
        (expense.busId as unknown as { busNumber?: string } | undefined)?.busNumber ?? "",
      category: expense.category,
      vendor: expense.vendor,
      amount: expense.amount,
      notes: expense.notes ?? "",
      addedBy:
        (expense.addedBy as unknown as { name?: string } | undefined)?.name ?? ""
    }));
    const headers: TemplateHeader[] = [
      { key: "date", header: "Date", example: "" },
      { key: "bus", header: "Bus", example: "" },
      { key: "category", header: "Category", example: "" },
      { key: "vendor", header: "Vendor", example: "" },
      { key: "amount", header: "Amount", example: "" },
      { key: "notes", header: "Notes", example: "" },
      { key: "addedBy", header: "Added By", example: "" }
    ];

    const file = generateTemplate(headers, "Expenses", rows, await getOrgName(orgId));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="taksha_expenses_${toDateStamp()}.xlsx"`);
    res.send(file);
  })
);

export default bulkRouter;

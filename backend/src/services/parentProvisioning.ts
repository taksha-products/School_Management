import bcrypt from "bcryptjs";
import { Types } from "mongoose";

import { Student } from "../models/Student";
import { User } from "../models/User";
import { generateTemporaryPassword } from "../utils/generateTemporaryPassword";
import { normalizeIndianMobile } from "../utils/phone";

export interface ParentProvisionInput {
  organizationId: string;
  studentId: Types.ObjectId | string;
  parentName: string;
  parentPhone: string;
  parentEmail?: string;
}

export interface ParentProvisionResult {
  studentId: string;
  parentUserId: string;
  name: string;
  phone: string;
  email: string;
  created: boolean;
  /** Only present when a new parent account was created. */
  temporaryPassword?: string;
}

/** Synthetic email is org-scoped so the same phone can exist in another school. */
const syntheticParentEmail = (organizationId: string, phone: string): string =>
  `parent.${phone}.${organizationId}@taksha.parents`;

/**
 * Finds or creates a parent user for the given phone **within the organization**
 * and links the student. Phone uniqueness is per-org.
 */
export const ensureParentAccountForStudent = async (
  input: ParentProvisionInput
): Promise<ParentProvisionResult> => {
  const phone = normalizeIndianMobile(input.parentPhone);
  if (!phone) {
    throw Object.assign(new Error("Enter a valid 10-digit Indian mobile number"), {
      statusCode: 400
    });
  }

  const parentName = input.parentName.trim();
  if (parentName.length < 2) {
    throw Object.assign(new Error("Parent name is required"), { statusCode: 400 });
  }

  const studentId = new Types.ObjectId(String(input.studentId));
  const organizationId = new Types.ObjectId(input.organizationId);

  const existing = await User.findOne({
    phone,
    role: "parent",
    organizationId
  });

  if (existing) {
    if (!existing.isActive) {
      throw Object.assign(new Error("Parent account for this phone is inactive"), {
        statusCode: 400
      });
    }

    await User.updateOne(
      { _id: existing._id },
      {
        $set: { name: parentName },
        $addToSet: { parentStudentIds: studentId }
      }
    );

    return {
      studentId: studentId.toString(),
      parentUserId: existing._id.toString(),
      name: parentName,
      phone,
      email: existing.email,
      created: false
    };
  }

  const email =
    input.parentEmail?.trim().toLowerCase() ||
    syntheticParentEmail(organizationId.toString(), phone);

  const emailTaken = await User.findOne({ email }).select("_id");
  if (emailTaken) {
    throw Object.assign(new Error("A user with this parent email already exists"), {
      statusCode: 409
    });
  }

  const temporaryPassword = generateTemporaryPassword();
  const parent = await User.create({
    name: parentName,
    email,
    phone,
    passwordHash: await bcrypt.hash(temporaryPassword, 10),
    role: "parent",
    organizationId,
    parentStudentIds: [studentId],
    isActive: true
  });

  return {
    studentId: studentId.toString(),
    parentUserId: parent._id.toString(),
    name: parent.name,
    phone,
    email: parent.email,
    created: true,
    temporaryPassword
  };
};

/**
 * Pushes parent account name/phone onto all linked student records in the same org.
 */
export const syncParentDetailsToLinkedStudents = async (params: {
  parentUserId: string | Types.ObjectId;
  parentName?: string;
  parentPhone?: string;
}): Promise<number> => {
  const setFields: Record<string, string> = {};

  if (typeof params.parentName === "string" && params.parentName.trim().length >= 2) {
    setFields.parentName = params.parentName.trim();
  }

  if (typeof params.parentPhone === "string") {
    const phone = normalizeIndianMobile(params.parentPhone);
    if (phone) {
      setFields.parentPhone = phone;
    }
  }

  if (Object.keys(setFields).length === 0) {
    return 0;
  }

  const parentId = new Types.ObjectId(String(params.parentUserId));
  const parent = await User.findById(parentId).select("parentStudentIds organizationId");

  const studentFilter: Record<string, unknown> = {
    $or: [{ parentUserId: parentId }]
  };
  if (parent?.parentStudentIds?.length) {
    (studentFilter.$or as Array<Record<string, unknown>>).push({
      _id: { $in: parent.parentStudentIds }
    });
  }
  if (parent?.organizationId) {
    studentFilter.organizationId = parent.organizationId;
  }

  const result = await Student.updateMany(studentFilter, {
    $set: { ...setFields, parentUserId: parentId }
  });

  return result.modifiedCount;
};

/**
 * Removes a student link from a parent account (e.g. when parent phone changes).
 * Does not delete the parent user.
 */
export const unlinkStudentFromParent = async (
  parentUserId: string | Types.ObjectId | undefined | null,
  studentId: string | Types.ObjectId
): Promise<void> => {
  if (!parentUserId) {
    return;
  }
  await User.updateOne(
    { _id: parentUserId, role: "parent" },
    { $pull: { parentStudentIds: new Types.ObjectId(String(studentId)) } }
  );
};

/**
 * Provisions parents for many newly inserted students (org-scoped).
 */
export const ensureParentAccountsForStudents = async (
  organizationId: string,
  students: Array<{
    _id: Types.ObjectId;
    parentName: string;
    parentPhone: string;
  }>
): Promise<{
  created: number;
  linked: number;
  results: ParentProvisionResult[];
  errors: Array<{ studentId: string; message: string }>;
}> => {
  let created = 0;
  let linked = 0;
  const results: ParentProvisionResult[] = [];
  const errors: Array<{ studentId: string; message: string }> = [];

  for (const student of students) {
    try {
      const result = await ensureParentAccountForStudent({
        organizationId,
        studentId: student._id,
        parentName: student.parentName,
        parentPhone: student.parentPhone
      });
      results.push(result);
      if (result.created) {
        created += 1;
      } else {
        linked += 1;
      }
    } catch (error) {
      errors.push({
        studentId: student._id.toString(),
        message: error instanceof Error ? error.message : "Parent provisioning failed"
      });
    }
  }

  return { created, linked, results, errors };
};

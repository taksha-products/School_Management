import { body } from "express-validator";

import { normalizeIndianMobile } from "../utils/phone";

export const createStudentValidation = [
  body("name").notEmpty().trim().isLength({ max: 100 }),
  body("grade").notEmpty().trim(),
  body("parentName").notEmpty().trim().isLength({ min: 2, max: 100 }),
  body("parentPhone")
    .notEmpty()
    .custom((value: string) => {
      if (!normalizeIndianMobile(value)) {
        throw new Error("Enter a valid 10-digit Indian mobile number");
      }
      return true;
    }),
  body("parentEmail").optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail(),
  body("academicYear").notEmpty().trim()
];

export const updateStudentValidation = [
  body("name").optional().trim().isLength({ min: 1, max: 100 }),
  body("grade").optional().trim().notEmpty(),
  body("parentName").optional().trim().isLength({ min: 2, max: 100 }),
  body("parentPhone")
    .optional()
    .custom((value: string) => {
      if (!normalizeIndianMobile(value)) {
        throw new Error("Enter a valid 10-digit Indian mobile number");
      }
      return true;
    }),
  body("parentEmail").optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail()
];

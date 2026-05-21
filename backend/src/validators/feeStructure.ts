import { body } from "express-validator";

export const createFeeStructureValidation = [
  body("name").notEmpty().trim(),
  body("academicYear").matches(/^\d{4}-\d{2}$/),
  body("feeHeads").isArray({ min: 1 })
];

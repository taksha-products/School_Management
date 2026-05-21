import { body } from "express-validator";

export const createStudentValidation = [
  body("name").notEmpty().trim().isLength({ max: 100 }),
  body("parentPhone").isMobilePhone("en-IN"),
  body("grade").notEmpty()
];

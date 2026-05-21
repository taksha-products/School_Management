import { body } from "express-validator";

export const collectSchoolFeesValidation = [
  body("studentId").isMongoId(),
  body("payments").isArray({ min: 1 }),
  body("paymentMode").isIn(["cash", "upi", "cheque", "online"])
];

import { body } from "express-validator";

import { normalizeIndianMobile } from "../utils/phone";

export const loginValidation = [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 })
];

const phoneValidator = body("phone")
  .trim()
  .notEmpty()
  .withMessage("phone is required")
  .custom((value: string) => {
    if (!normalizeIndianMobile(value)) {
      throw new Error("Enter a valid 10-digit Indian mobile number");
    }
    return true;
  });

export const otpRequestValidation = [
  phoneValidator,
  body("orgCode").optional({ nullable: true, checkFalsy: true }).trim().isLength({ min: 2, max: 64 })
];

export const otpVerifyValidation = [
  phoneValidator,
  body("otp")
    .trim()
    .matches(/^\d{6}$/)
    .withMessage("otp must be a 6-digit code"),
  body("orgCode").optional({ nullable: true, checkFalsy: true }).trim().isLength({ min: 2, max: 64 })
];

export const otpSelectSchoolValidation = [
  body("selectionToken").trim().notEmpty().isLength({ min: 32 }),
  body("orgCode").trim().notEmpty().isLength({ min: 2, max: 64 })
];

export const refreshTokenBodyValidation = [
  body("refreshToken").optional().isString().isLength({ min: 32 })
];

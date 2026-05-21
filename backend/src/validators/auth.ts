import { body } from "express-validator";

export const loginValidation = [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 })
];

import { body } from "express-validator";

export const createBusValidation = [
  body("busNumber").notEmpty().trim(),
  body("driverPhone").isMobilePhone("en-IN"),
  body("capacity").isInt({ min: 1, max: 100 })
];

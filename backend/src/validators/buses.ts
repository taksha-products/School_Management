import { body } from "express-validator";

import { TRACKER_ID_PATTERN } from "../services/busTrackerService";

const trackerIdRule = body("trackerId")
  .optional({ values: "null" })
  .isString()
  .withMessage("trackerId must be a string")
  .bail()
  .custom((value: string) => value.trim() === "" || TRACKER_ID_PATTERN.test(value.trim()))
  .withMessage(
    "trackerId must be 3-64 characters: letters, digits, dots, dashes, colons or underscores"
  );

export const createBusValidation = [
  body("busNumber").notEmpty().trim(),
  body("driverPhone").isMobilePhone("en-IN"),
  body("capacity").isInt({ min: 1, max: 100 }),
  trackerIdRule
];

export const updateBusValidation = [
  body("capacity").optional().isInt({ min: 1, max: 100 }),
  body("status").optional().isIn(["active", "inactive"]),
  trackerIdRule
];

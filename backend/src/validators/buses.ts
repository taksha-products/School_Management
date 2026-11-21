import { body } from "express-validator";

import { TRACKER_ID_PATTERN } from "../services/busTrackerService";

/** Limits keep stored text sane and block oversized payloads. */
export const BUS_FIELD_LIMITS = {
  busNumber: 30,
  routeName: 100,
  routeNumber: 20,
  driverName: 100,
  driverPhone: 20
} as const;

/** A required, non-blank string of bounded length (rejects objects, arrays and numbers). */
const requiredText = (field: keyof typeof BUS_FIELD_LIMITS) =>
  body(field)
    .isString()
    .withMessage(`${field} must be text`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .isLength({ max: BUS_FIELD_LIMITS[field] })
    .withMessage(`${field} must be at most ${BUS_FIELD_LIMITS[field]} characters`);

/** Same rules for updates, where the field may be absent. */
const optionalText = (field: keyof typeof BUS_FIELD_LIMITS) =>
  body(field)
    .optional()
    .isString()
    .withMessage(`${field} must be text`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${field} cannot be blank`)
    .isLength({ max: BUS_FIELD_LIMITS[field] })
    .withMessage(`${field} must be at most ${BUS_FIELD_LIMITS[field]} characters`);

const routeNumberRule = body("routeNumber")
  .optional({ values: "null" })
  .isString()
  .withMessage("routeNumber must be text")
  .bail()
  .isLength({ max: BUS_FIELD_LIMITS.routeNumber })
  .withMessage(`routeNumber must be at most ${BUS_FIELD_LIMITS.routeNumber} characters`);

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
  requiredText("busNumber"),
  requiredText("routeName"),
  requiredText("driverName"),
  body("driverPhone")
    .isString()
    .withMessage("driverPhone must be text")
    .bail()
    .isMobilePhone("en-IN")
    .withMessage("driverPhone must be a valid Indian mobile number"),
  body("capacity").isInt({ min: 1, max: 100 }).withMessage("capacity must be between 1 and 100"),
  routeNumberRule,
  trackerIdRule
];

export const updateBusValidation = [
  optionalText("busNumber"),
  optionalText("routeName"),
  optionalText("driverName"),
  // Phone format is not re-checked on edit so existing buses stay editable.
  body("driverPhone")
    .optional()
    .isString()
    .withMessage("driverPhone must be text")
    .bail()
    .isLength({ min: 1, max: BUS_FIELD_LIMITS.driverPhone })
    .withMessage(`driverPhone must be at most ${BUS_FIELD_LIMITS.driverPhone} characters`),
  body("capacity").optional().isInt({ min: 1, max: 100 }).withMessage("capacity must be between 1 and 100"),
  body("status").optional().isIn(["active", "inactive"]).withMessage("status must be active or inactive"),
  routeNumberRule,
  trackerIdRule
];

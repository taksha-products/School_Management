import type { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";

export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      data: null,
      message: "Validation failed",
      errors: errors.array().map((e) => ({
        field: "path" in e ? String(e.path) : "",
        message: e.msg
      }))
    });
    return;
  }
  next();
};

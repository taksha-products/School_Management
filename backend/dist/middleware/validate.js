"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const express_validator_1 = require("express-validator");
const validate = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
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
exports.validate = validate;

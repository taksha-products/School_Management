"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStudentValidation = void 0;
const express_validator_1 = require("express-validator");
exports.createStudentValidation = [
    (0, express_validator_1.body)("name").notEmpty().trim().isLength({ max: 100 }),
    (0, express_validator_1.body)("parentPhone").isMobilePhone("en-IN"),
    (0, express_validator_1.body)("monthlyFee").isFloat({ min: 0 }),
    (0, express_validator_1.body)("grade").notEmpty()
];

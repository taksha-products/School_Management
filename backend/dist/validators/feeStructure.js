"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFeeStructureValidation = void 0;
const express_validator_1 = require("express-validator");
exports.createFeeStructureValidation = [
    (0, express_validator_1.body)("name").notEmpty().trim(),
    (0, express_validator_1.body)("academicYear").matches(/^\d{4}-\d{2}$/),
    (0, express_validator_1.body)("feeHeads").isArray({ min: 1 })
];

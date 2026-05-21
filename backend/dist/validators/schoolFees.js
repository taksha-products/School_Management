"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectSchoolFeesValidation = void 0;
const express_validator_1 = require("express-validator");
exports.collectSchoolFeesValidation = [
    (0, express_validator_1.body)("studentId").isMongoId(),
    (0, express_validator_1.body)("payments").isArray({ min: 1 }),
    (0, express_validator_1.body)("paymentMode").isIn(["cash", "upi", "cheque", "online"])
];

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBusValidation = void 0;
const express_validator_1 = require("express-validator");
exports.createBusValidation = [
    (0, express_validator_1.body)("busNumber").notEmpty().trim(),
    (0, express_validator_1.body)("driverPhone").isMobilePhone("en-IN"),
    (0, express_validator_1.body)("capacity").isInt({ min: 1, max: 100 })
];

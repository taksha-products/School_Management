"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
const asyncHandler = (handler) => {
    // TODO: Wrap async route handlers with centralized error forwarding.
    return (req, res, next) => {
        void handler(req, res, next).catch(next);
    };
};
exports.asyncHandler = asyncHandler;

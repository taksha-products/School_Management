"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateOrgSchoolFeesCache = exports.invalidateOrgReportsCache = exports.cacheDelPattern = exports.cacheDel = exports.cacheSet = exports.cacheGet = void 0;
const node_cache_1 = __importDefault(require("node-cache"));
const cache = new node_cache_1.default({
    stdTTL: 300,
    checkperiod: 60,
    maxKeys: 1000
});
const cacheGet = (key) => cache.get(key);
exports.cacheGet = cacheGet;
const cacheSet = (key, data, ttl) => {
    cache.set(key, data, ttl ?? 300);
};
exports.cacheSet = cacheSet;
const cacheDel = (key) => {
    cache.del(key);
};
exports.cacheDel = cacheDel;
const cacheDelPattern = (pattern) => {
    const keys = cache.keys().filter((k) => k.includes(pattern));
    cache.del(keys);
};
exports.cacheDelPattern = cacheDelPattern;
/** Clears cached bus-fee reports after FeePayment or Expense changes. */
const invalidateOrgReportsCache = (orgId) => {
    (0, exports.cacheDelPattern)(`${orgId}:reports`);
};
exports.invalidateOrgReportsCache = invalidateOrgReportsCache;
/** Clears cached school-fee summary after ledger/payment changes. */
const invalidateOrgSchoolFeesCache = (orgId) => {
    (0, exports.cacheDelPattern)(`${orgId}:school-fees`);
};
exports.invalidateOrgSchoolFeesCache = invalidateOrgSchoolFeesCache;

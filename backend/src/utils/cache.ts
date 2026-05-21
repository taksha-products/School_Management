import NodeCache from "node-cache";

const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  maxKeys: 1000
});

export const cacheGet = <T>(key: string): T | undefined => cache.get<T>(key);

export const cacheSet = (key: string, data: unknown, ttl?: number): void => {
  cache.set(key, data, ttl ?? 300);
};

export const cacheDel = (key: string): void => {
  cache.del(key);
};

export const cacheDelPattern = (pattern: string): void => {
  const keys = cache.keys().filter((k) => k.includes(pattern));
  cache.del(keys);
};

/** Clears cached bus-fee reports after FeePayment or Expense changes. */
export const invalidateOrgReportsCache = (orgId: string): void => {
  cacheDelPattern(`${orgId}:reports`);
};

/** Clears cached school-fee summary after ledger/payment changes. */
export const invalidateOrgSchoolFeesCache = (orgId: string): void => {
  cacheDelPattern(`${orgId}:school-fees`);
};

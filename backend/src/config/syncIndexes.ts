import { Bus } from "../models/Bus";

/**
 * Drops obsolete MongoDB indexes that can break org-scoped uniqueness
 * (e.g. legacy global busNumber_1 on buses).
 */
export const syncCriticalIndexes = async (): Promise<void> => {
  try {
    const dropped = await Bus.syncIndexes();
    if (dropped.length > 0) {
      console.log(`[Bus] Dropped obsolete indexes: ${dropped.join(", ")}`);
    }
  } catch (error) {
    console.error("[Bus] Critical index sync failed:", error);
  }
};

import { Bus } from "../models/Bus";
import { User } from "../models/User";

/**
 * Drops obsolete MongoDB indexes that can break org-scoped uniqueness
 * (e.g. legacy global busNumber_1 on buses, global phone_1 on users).
 */
export const syncCriticalIndexes = async (): Promise<void> => {
  try {
    const droppedBuses = await Bus.syncIndexes();
    if (droppedBuses.length > 0) {
      console.log(`[Bus] Dropped obsolete indexes: ${droppedBuses.join(", ")}`);
    }
  } catch (error) {
    console.error("[Bus] Critical index sync failed:", error);
  }

  try {
    // Drop legacy global unique phone index if present
    const userCollection = User.collection;
    const indexes = await userCollection.indexes();
    const legacyPhone = indexes.find(
      (idx) =>
        idx.name === "phone_1" ||
        (idx.key && Object.keys(idx.key as object).length === 1 && (idx.key as { phone?: number }).phone === 1)
    );
    if (legacyPhone?.name) {
      await userCollection.dropIndex(legacyPhone.name);
      console.log(`[User] Dropped obsolete index: ${legacyPhone.name}`);
    }

    const droppedUsers = await User.syncIndexes();
    if (droppedUsers.length > 0) {
      console.log(`[User] Dropped obsolete indexes: ${droppedUsers.join(", ")}`);
    }
  } catch (error) {
    console.error("[User] Critical index sync failed:", error);
  }
};

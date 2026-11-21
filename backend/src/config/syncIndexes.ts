import { Bus } from "../models/Bus";
import { GpsDevice } from "../models/GpsDevice";
import { Student } from "../models/Student";
import { User } from "../models/User";

/**
 * Brings critical collections in line with the schema's indexes, dropping obsolete ones
 * that can break uniqueness rules (e.g. legacy global busNumber_1 on buses, the
 * non-partial traccarDeviceId_1 on gpsdevices, the non-partial admissionNo index on
 * students, or the global phone_1 on users).
 */
export const syncCriticalIndexes = async (): Promise<void> => {
  const targets = [
    { name: "Bus", sync: () => Bus.syncIndexes() },
    { name: "GpsDevice", sync: () => GpsDevice.syncIndexes() },
    // admissionNo must be unique only when present (students may be added without one).
    { name: "Student", sync: () => Student.syncIndexes() }
  ];

  for (const target of targets) {
    try {
      const dropped = await target.sync();
      if (dropped.length > 0) {
        console.log(`[${target.name}] Dropped obsolete indexes: ${dropped.join(", ")}`);
      }
    } catch (error) {
      console.error(`[${target.name}] Critical index sync failed:`, error);
    }
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

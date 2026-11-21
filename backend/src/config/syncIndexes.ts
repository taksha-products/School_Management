import { Bus } from "../models/Bus";
import { GpsDevice } from "../models/GpsDevice";

/**
 * Brings critical collections in line with the schema's indexes, dropping obsolete ones
 * that can break uniqueness rules (e.g. legacy global busNumber_1 on buses, or the
 * non-partial traccarDeviceId_1 on gpsdevices).
 */
export const syncCriticalIndexes = async (): Promise<void> => {
  const targets = [
    { name: "Bus", sync: () => Bus.syncIndexes() },
    { name: "GpsDevice", sync: () => GpsDevice.syncIndexes() }
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
};

import { Types } from "mongoose";

import { StudentTransport } from "../models/StudentTransport";

export const countActiveStudentsOnBus = async (
  organizationId: Types.ObjectId | string,
  busId: Types.ObjectId | string
): Promise<number> =>
  StudentTransport.countDocuments({
    organizationId: new Types.ObjectId(String(organizationId)),
    busId: new Types.ObjectId(String(busId)),
    status: "active"
  });

export const getRemainingBusSeats = (capacity: number, activeCount: number): number =>
  Math.max(0, capacity - activeCount);

export const wouldExceedBusCapacity = (
  capacity: number,
  activeCount: number,
  additionalSeats: number
): boolean => capacity > 0 && activeCount + additionalSeats > capacity;

export const busCapacityExceededMessage = (
  busNumber: string,
  capacity: number,
  activeCount: number,
  requestedSeats: number
): string => {
  const remaining = getRemainingBusSeats(capacity, activeCount);
  return `Bus ${busNumber} has only ${remaining} seat${remaining === 1 ? "" : "s"} left (${activeCount}/${capacity}). Cannot assign ${requestedSeats} student${requestedSeats === 1 ? "" : "s"}.`;
};

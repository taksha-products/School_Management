export interface Bus {
  _id: string;
  busNumber: string;
  routeName: string;
  /** Short route number shown on the live map, e.g. "R5". */
  routeNumber?: string;
  driverName: string;
  driverPhone: string;
  capacity: number;
  status: "active" | "inactive";
  activeStudentCount?: number;
  tracker?: BusTracker;
}

export type BusTrackerStatus = "none" | "pending" | "synced" | "failed" | "disabled";

/** GPS tracker attached to a bus (managed from the platform; synced to Traccar by the API). */
export interface BusTracker {
  trackerId: string | null;
  status: BusTrackerStatus;
  error: string | null;
  lastSeen: string | null;
}

export interface StudentTransportInfo {
  /** Parent view: the school has live bus tracking switched on for parents. */
  trackingEnabled?: boolean;
  busId?: string;
  busNumber?: string;
  routeName?: string;
  monthlyTransportFee: number;
  pickupStop?: string;
  dropStop?: string;
  status?: "active" | "inactive";
}

export interface Student {
  _id: string;
  admissionNo?: string;
  name: string;
  grade: string;
  section?: string;
  parentName: string;
  parentPhone: string;
  parentUserId?: string;
  address?: string;
  status: "active" | "inactive";
  academicYear: string;
  transport?: StudentTransportInfo | null;
}

export interface ParentAccountProvision {
  studentId?: string;
  parentUserId: string;
  name: string;
  phone: string;
  email: string;
  created: boolean;
  temporaryPassword?: string;
}

export interface StudentTransportRecord {
  _id: string;
  studentId: string | Pick<Student, "_id" | "name" | "grade" | "parentPhone">;
  busId: string | Pick<Bus, "_id" | "busNumber" | "routeName">;
  monthlyTransportFee: number;
  pickupStop?: string;
  dropStop?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: "active" | "inactive";
  academicYear: string;
}

export interface FeePayment {
  _id: string;
  studentId: string | Pick<Student, "_id" | "name" | "grade">;
  transportId?: string;
  busId: string | Pick<Bus, "_id" | "busNumber">;
  academicYear: string;
  amount: number;
  amountPaid: number;
  month: string;
  status: "paid" | "partial" | "pending" | "overdue";
  paidAt?: string;
  collectedBy?: string;
  notes?: string;
  paymentMode?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  collectedAt?: string;
  paymentNotes?: string;
}

export interface Expense {
  _id: string;
  busId: string | Pick<Bus, "_id" | "busNumber" | "routeName">;
  category: "diesel" | "maintenance" | "other";
  amount: number;
  date: string;
  vendor: string;
  notes?: string;
  academicYear: string;
  addedBy?: { _id: string; name: string; role: string };
  deleted?: boolean;
}

export interface MonthlyReport {
  busId: string;
  busNumber: string;
  routeName: string;
  totalFeesDue: number;
  totalFeesCollected: number;
  pendingCount: number;
  totalExpenses: number;
  netProfit: number;
  studentCount: number;
  transportStudentCount?: number;
}

export interface BusTrend {
  month: string;
  totalFeesCollected: number;
  totalExpenses: number;
  netProfit: number;
}

export interface DashboardSummary {
  totalStudents: number;
  totalSchoolStudents?: number;
  onBusStudents?: number;
  transportStudents?: number;
  totalFeesCollected: number;
  totalExpenses: number;
  netProfit: number;
  busCount: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

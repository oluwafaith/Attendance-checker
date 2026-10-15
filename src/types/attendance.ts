/**
 * Represents the supported leave types in attendance records.
 */
export type LeaveType =
  | "None"
  | "Annual Leave"
  | "Sick Leave"
  | "Half-day Leave"
  | "Unpaid Leave"
  | "Parental Leave"
  | "Bereavement Leave"
  | string;

/**
 * Raw string-based CSV row structure directly parsed from the attendance file.
 */
export interface RawAttendanceCsvRow {
  employee_id: string;
  employee_name: string;
  department: string;
  date: string;
  scheduled_hours: string;
  clock_in: string;
  clock_out: string;
  break_minutes: string;
  actual_hours: string;
  leave_type: string;
  leave_hours: string;
  is_approved: string;
}

/**
 * Clean, strongly-typed attendance record parsed and coerced from the CSV row.
 */
export interface AttendanceRecord {
  /** Unique employee identifier (e.g., 'EMP001') */
  employeeId: string;
  /** Full employee name */
  employeeName: string;
  /** Department / Team name */
  department: string;
  /** Shift date in ISO format YYYY-MM-DD */
  date: string;
  /** Scheduled / expected shift hours (e.g., 8.0, or 0.0 on off-days) */
  scheduledHours: number;
  /** Clock-in time in HH:mm format, or null if absent/leave */
  clockIn: string | null;
  /** Clock-out time in HH:mm format, or null if absent or missed */
  clockOut: string | null;
  /** Break duration in minutes */
  breakMinutes: number;
  /** Net hours worked */
  actualHours: number;
  /** Leave type claimed if any */
  leaveType: LeaveType;
  /** Compensated leave hours */
  leaveHours: number;
  /** Whether the shift, overtime, or leave was approved by management */
  isApproved: boolean;
}

/**
 * Catalog of supported unusual pattern / anomaly categories.
 */
export type AnomalyCategory =
  | "MISSING_CLOCK_OUT"
  | "CONCURRENT_WORK_AND_LEAVE"
  | "EXCESSIVE_OVERTIME"
  | "UNEXPLAINED_ABSENCE"
  | "INVERTED_TIMESTAMPS"
  | "UNAPPROVED_WEEKEND_WORK"
  | "EXCESSIVE_BREAK"
  | "UNAPPROVED_UNDERTIME"
  | "OVERALLOCATED_HOURS";

/**
 * Severity level of an identified anomaly.
 */
export type AnomalySeverity = "INFO" | "WARNING" | "CRITICAL";

/**
 * Represents an individual flag detected on an attendance record.
 */
export interface AttendanceFlag {
  /** Categorical code of the anomaly */
  category: AnomalyCategory;
  /** Severity level */
  severity: AnomalySeverity;
  /** Concise, single-sentence explanation of the discrepancy */
  explanation: string;
  /** Optional metadata / context values that triggered the flag */
  metadata?: {
    field?: keyof AttendanceRecord;
    expected?: string | number | boolean;
    actual?: string | number | boolean;
    [key: string]: unknown;
  };
}

/**
 * Normal attendance record (usual pattern): Passes all compliance and integrity checks.
 */
export interface NormalAttendanceRecord {
  status: "USUAL";
  record: AttendanceRecord;
}

/**
 * Flagged attendance record (unusual pattern): Contains one or more detected anomalies.
 */
export interface UnusualAttendanceRecord {
  status: "UNUSUAL";
  record: AttendanceRecord;
  /** List of all flags triggered for this record */
  flags: AttendanceFlag[];
  /** Combined or primary one-sentence explanation for concise reporting */
  primaryExplanation: string;
}

/**
 * Discriminated union representing an evaluated attendance record.
 */
export type EvaluatedAttendanceRecord =
  | NormalAttendanceRecord
  | UnusualAttendanceRecord;

/**
 * Aggregate report summarizing a full batch check.
 */
export interface AttendanceCheckSummary {
  totalProcessed: number;
  totalUsual: number;
  totalUnusual: number;
  unusualPercentage: number;
  flagBreakdown: Record<AnomalyCategory, number>;
  flaggedRecords: UnusualAttendanceRecord[];
}

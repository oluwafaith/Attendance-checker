import {
  AttendanceRecord,
  AttendanceAnomaly,
  AnomalyType,
} from '../types/attendance';

/**
 * Converts an 'HH:mm' 24-hour time string to total minutes from midnight.
 *
 * @param timeStr - Time string formatted as 'HH:mm' (e.g., '09:30', '17:45')
 * @returns Total minutes from 00:00
 */
export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid time format: "${timeStr}". Expected 'HH:mm'.`);
  }

  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(
      `Invalid time value: "${timeStr}". Hours must be 0-23 and minutes 0-59.`,
    );
  }

  return hours * 60 + minutes;
}

/**
 * Calculates the elapsed time difference in minutes between two 'HH:mm' strings.
 * Handles shifts spanning across midnight (e.g., 22:00 to 06:00).
 *
 * @param startTime - Clock-in time 'HH:mm'
 * @param endTime - Clock-out time 'HH:mm'
 * @returns Elapsed minutes
 */
export function calculateTimeDifferenceMinutes(
  startTime: string,
  endTime: string,
): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (end >= start) {
    return end - start;
  }

  // Crossing midnight: (minutes until midnight) + (minutes past midnight)
  return 24 * 60 - start + end;
}

/**
 * Helper function to calculate net worked hours between two 'HH:mm' strings,
 * deducting any unpaid break minutes.
 *
 * @param startTime - Clock-in time 'HH:mm'
 * @param endTime - Clock-out time 'HH:mm'
 * @param breakMinutes - Break duration in minutes to subtract (defaults to 0)
 * @returns Net duration in decimal hours (e.g., 8.5)
 */
export function calculateTimeDifference(
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
): number {
  const grossMinutes = calculateTimeDifferenceMinutes(startTime, endTime);
  const netMinutes = Math.max(0, grossMinutes - breakMinutes);
  return Number.parseFloat((netMinutes / 60).toFixed(2));
}

/**
 * Helper to check if a leave type corresponds to Sick or Annual leave.
 */
function isSickOrAnnualLeave(leaveType: string): boolean {
  const normalized = leaveType.trim().toLowerCase();
  return normalized.includes("sick") || normalized.includes("annual");
}

/**
 * Scans an individual attendance record against defined anomaly rules.
 *
 * @param record - Clean AttendanceRecord
 * @returns Array of AttendanceAnomaly objects found on this record
 */
export function checkRecordAnomalies(
  record: AttendanceRecord,
): AttendanceAnomaly[] {
  const anomalies: AttendanceAnomaly[] = [];

  const hasClockIn = Boolean(record.clockIn && record.clockIn.trim());
  const hasClockOut = Boolean(record.clockOut && record.clockOut.trim());
  const isNoLeave =
    record.leaveType.trim().toLowerCase() === "none" || record.leaveHours === 0;

  // 1. UNEXPLAINED_ABSENCE: No clock-in or clock-out and leave_type === 'None' (on scheduled workdays)
  if (!hasClockIn && !hasClockOut && isNoLeave && record.scheduledHours > 0) {
    anomalies.push({
      type: "UNEXPLAINED_ABSENCE",
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      date: record.date,
      severity: "CRITICAL",
      explanation: `Employee logged no clock-in or clock-out timestamps on a scheduled ${record.scheduledHours}h workday without submitting any leave.`,
      record,
    });
  }

  // 2. MISSING_CLOCK_OUT: Clock-in exists, but clock-out is missing and leave_type === 'None'
  if (hasClockIn && !hasClockOut && isNoLeave) {
    anomalies.push({
      type: "MISSING_CLOCK_OUT",
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      date: record.date,
      severity: "WARNING",
      explanation: `Clock-in was recorded at ${record.clockIn}, but clock-out is missing with no leave filed, leaving the shift incomplete.`,
      record,
    });
  }

  // 3. EXCESSIVE_OVERTIME: Worked total duration > 12 hours in a single shift
  let shiftHours = record.actualHours;
  if (hasClockIn && hasClockOut && record.clockIn && record.clockOut) {
    // Re-verify worked duration using time difference helper
    const calculatedHours = calculateTimeDifference(
      record.clockIn,
      record.clockOut,
      record.breakMinutes,
    );
    shiftHours = Math.max(record.actualHours, calculatedHours);
  }

  if (shiftHours > 12) {
    anomalies.push({
      type: "EXCESSIVE_OVERTIME",
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      date: record.date,
      severity: "CRITICAL",
      explanation: `Shift duration of ${shiftHours.toFixed(1)} hours exceeds the maximum safety limit of 12.0 hours.`,
      record,
    });
  }

  // 4. WORKING_ON_LEAVE: Clock-in and clock-out exist while leave_type is Sick or Annual
  if (hasClockIn && hasClockOut && isSickOrAnnualLeave(record.leaveType)) {
    anomalies.push({
      type: "WORKING_ON_LEAVE",
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      date: record.date,
      severity: "WARNING",
      explanation: `Employee logged work hours (${record.clockIn} - ${record.clockOut}) concurrently with ${record.leaveType} (${record.leaveHours}h claimed).`,
      record,
    });
  }

  // 5. SEVERE_TARDINESS: Clock-in time is 10:30 AM or later for a standard morning shift
  // Applies when scheduled shift is standard day (scheduledHours > 0) and employee had no approved morning leave
  if (hasClockIn && record.clockIn && record.scheduledHours > 0 && isNoLeave) {
    const clockInMinutes = timeToMinutes(record.clockIn);
    const tardyThreshold = timeToMinutes("10:30");

    // Assumes standard morning shift start window (before 14:00)
    if (
      clockInMinutes >= tardyThreshold &&
      clockInMinutes < timeToMinutes("14:00")
    ) {
      anomalies.push({
        type: "SEVERE_TARDINESS",
        employeeId: record.employeeId,
        employeeName: record.employeeName,
        date: record.date,
        severity: "WARNING",
        explanation: `Clock-in at ${record.clockIn} is at or later than the 10:30 AM severe tardiness threshold for a morning shift.`,
        record,
      });
    }
  }

  return anomalies;
}

/**
 * Scans an array of AttendanceRecord objects and returns all detected AttendanceAnomaly flags.
 *
 * @param records - Array of strongly-typed AttendanceRecord objects
 * @returns Array of AttendanceAnomaly objects
 */
export function runRuleEngine(
  records: AttendanceRecord[],
): AttendanceAnomaly[] {
  const allAnomalies: AttendanceAnomaly[] = [];

  for (const record of records) {
    const recordAnomalies = checkRecordAnomalies(record);
    if (recordAnomalies.length > 0) {
      allAnomalies.push(...recordAnomalies);
    }
  }

  return allAnomalies;
}

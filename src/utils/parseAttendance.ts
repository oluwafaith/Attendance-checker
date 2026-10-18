import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { AttendanceRecord, RawAttendanceCsvRow } from '../types/attendance';

/**
 * Options for parsing the attendance CSV.
 */
export interface ParseAttendanceOptions {
  /**
   * Throw an error if a row fails parsing or validation.
   * If false, invalid rows are skipped or logged. Defaults to true.
   */
  strict?: boolean;
}

/**
 * Transforms a raw, string-based CSV row into a strongly-typed AttendanceRecord.
 *
 * @param rawRow - Raw row parsed from PapaParse
 * @param rowIndex - 1-based index (accounting for header) for helpful error messages
 * @returns Strongly typed AttendanceRecord
 */
export function transformRowToRecord(rawRow: RawAttendanceCsvRow, rowIndex: number): AttendanceRecord {
  // Validate required identity fields
  if (!rawRow.employee_id || !rawRow.date) {
    throw new Error(`Row ${rowIndex}: Missing required fields ('employee_id' or 'date')`);
  }

  // Parse numeric values with fallback and validation
  const scheduledHours = Number.parseFloat(rawRow.scheduled_hours?.trim() || '0');
  const breakMinutes = Number.parseInt(rawRow.break_minutes?.trim() || '0', 10);
  const actualHours = Number.parseFloat(rawRow.actual_hours?.trim() || '0');
  const leaveHours = Number.parseFloat(rawRow.leave_hours?.trim() || '0');

  if (Number.isNaN(scheduledHours)) {
    throw new TypeError(`Row ${rowIndex}: Invalid number for 'scheduled_hours': "${rawRow.scheduled_hours}"`);
  }
  if (Number.isNaN(breakMinutes)) {
    throw new TypeError(`Row ${rowIndex}: Invalid number for 'break_minutes': "${rawRow.break_minutes}"`);
  }
  if (Number.isNaN(actualHours)) {
    throw new TypeError(`Row ${rowIndex}: Invalid number for 'actual_hours': "${rawRow.actual_hours}"`);
  }
  if (Number.isNaN(leaveHours)) {
    throw new TypeError(`Row ${rowIndex}: Invalid number for 'leave_hours': "${rawRow.leave_hours}"`);
  }

  // Normalize string/nullable time fields
  const clockIn = rawRow.clock_in?.trim() || null;
  const clockOut = rawRow.clock_out?.trim() || null;
  const leaveType = rawRow.leave_type?.trim() || 'None';

  // Normalize boolean approval
  const rawApproved = rawRow.is_approved?.trim().toLowerCase();
  const isApproved = rawApproved === 'true' || rawApproved === 'yes' || rawApproved === '1';

  return {
    employeeId: rawRow.employee_id.trim(),
    employeeName: rawRow.employee_name?.trim() ?? '',
    department: rawRow.department?.trim() ?? '',
    date: rawRow.date.trim(),
    scheduledHours,
    clockIn,
    clockOut,
    breakMinutes,
    actualHours,
    leaveType,
    leaveHours,
    isApproved
  };
}

/**
 * Parses raw CSV string content into typed AttendanceRecord objects using PapaParse.
 *
 * @param csvContent - Raw CSV file string
 * @param options - Parsing options
 * @returns Array of strongly-typed AttendanceRecord objects
 */
export function parseAttendanceCsv(
  csvContent: string,
  options: ParseAttendanceOptions = { strict: true }
): AttendanceRecord[] {
  const parseResult = Papa.parse<RawAttendanceCsvRow>(csvContent, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header: string) => header.trim()
  });

  if (parseResult.errors.length > 0) {
    const errorDetails = parseResult.errors
      .map((err) => `Line ${err.row ?? 'unknown'}: ${err.message}`)
      .join('; ');
    throw new Error(`CSV parsing errors encountered: ${errorDetails}`);
  }

  const records: AttendanceRecord[] = [];

  for (let i = 0; i < parseResult.data.length; i++) {
    const rawRow = parseResult.data[i];
    const rowNumber = i + 2; // +1 for 0-index, +1 for header line

    try {
      const record = transformRowToRecord(rawRow, rowNumber);
      records.push(record);
    } catch (error) {
      if (options.strict) {
        throw error;
      }
      console.warn(`[attendance-checker] Warning: Skipping invalid row ${rowNumber}:`, (error as Error).message);
    }
  }

  return records;
}

/**
 * Loads and parses an attendance CSV file from disk.
 *
 * @param filePath - Path to the CSV file (relative or absolute)
 * @param options - Parsing options
 * @returns Promise resolving to an array of AttendanceRecord objects
 */
export async function loadAttendanceCsv(
  filePath: string,
  options?: ParseAttendanceOptions
): Promise<AttendanceRecord[]> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Attendance CSV file not found at path: ${resolvedPath}`);
  }

  const fileContent = await fs.promises.readFile(resolvedPath, 'utf8');
  return parseAttendanceCsv(fileContent, options);
}

// ---------------------------------------------------------------------------
// CLI Execution Block (runs if directly invoked via `npx tsx`)
// ---------------------------------------------------------------------------
const isDirectExecution =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith('parseAttendance.ts') ||
    process.argv[1].endsWith('parseAttendance.js'));

if (isDirectExecution) {
  const targetFile =
    process.argv[2] ||
    (fs.existsSync(path.resolve(process.cwd(), 'sample_attendance.csv'))
      ? 'sample_attendance.csv'
      : 'data/attendance_sample.csv');

  console.log(`[attendance-checker] Loading attendance records from: ${targetFile}`);

  loadAttendanceCsv(targetFile)
    .then((records) => {
      console.log(`✓ Successfully loaded and parsed ${records.length} records.\n`);
      console.log('Sample parsed record (first record):');
      console.dir(records[0], { depth: null });

      const sampleUnusual = records.find((r) => !r.isApproved || r.actualHours <= 0 || r.actualHours > 12);
      if (sampleUnusual) {
        console.log('\nSample flagged / unusual record:');
        console.dir(sampleUnusual, { depth: null });
      }
    })
    .catch((err) => {
      console.error('✗ Failed to parse attendance CSV:', err);
      process.exit(1);
    });
}

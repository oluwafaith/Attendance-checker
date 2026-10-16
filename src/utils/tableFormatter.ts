import Table from 'cli-table3';
import { AttendanceAnomaly, EnrichedAttendanceAnomaly } from '../types/attendance.js';

// ANSI color escape codes for terminal styling
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  boldRed: '\x1b[1;31m',
  yellow: '\x1b[33m',
  boldYellow: '\x1b[1;33m',
  cyan: '\x1b[36m',
  boldCyan: '\x1b[1;36m',
  green: '\x1b[32m',
  gray: '\x1b[90m'
};

export type TargetSeverity = 'HIGH' | 'MEDIUM';

/**
 * Normalizes severity codes ('CRITICAL' -> 'HIGH', 'WARNING' -> 'MEDIUM').
 */
function normalizeSeverity(severity: string): TargetSeverity {
  const upper = severity?.toUpperCase() || '';
  if (upper === 'CRITICAL' || upper === 'HIGH') {
    return 'HIGH';
  }
  return 'MEDIUM';
}

/**
 * Formats finalized attendance anomalies into clean, color-coded cli-table3 tables
 * grouped by severity level (HIGH, MEDIUM).
 *
 * @param anomalies - Array of AttendanceAnomaly or EnrichedAttendanceAnomaly objects
 * @returns Formatted terminal string containing the tables and summary
 */
export function formatAnomaliesTable(
  anomalies: (AttendanceAnomaly | EnrichedAttendanceAnomaly)[]
): string {
  if (!anomalies || anomalies.length === 0) {
    return `${colors.green}✓ No attendance anomalies detected. All records are compliant.${colors.reset}\n`;
  }

  // 1. Group records by normalized severity
  const grouped: Record<TargetSeverity, (AttendanceAnomaly | EnrichedAttendanceAnomaly)[]> = {
    HIGH: [],
    MEDIUM: []
  };

  for (const anomaly of anomalies) {
    const sev = normalizeSeverity(anomaly.severity);
    grouped[sev].push(anomaly);
  }

  const outputSections: string[] = [];

  // Table styling configuration
  const tableConfig = {
    head: [
      `${colors.bold}Employee${colors.reset}`,
      `${colors.bold}Date${colors.reset}`,
      `${colors.bold}Rule Violation${colors.reset}`,
      `${colors.bold}AI Explanation${colors.reset}`
    ],
    colWidths: [22, 12, 24, 52],
    wordWrap: true,
    style: {
      head: [],
      border: ['gray']
    }
  };

  // Helper to format violation name nicely
  const formatViolation = (type: string, color: string) =>
    `${color}${type.replace(/_/g, ' ')}${colors.reset}`;

  // 2. Render HIGH Severity Table (Red)
  if (grouped.HIGH.length > 0) {
    const highTable = new Table(tableConfig);

    for (const item of grouped.HIGH) {
      highTable.push([
        `${colors.bold}${item.employeeName}${colors.reset}\n${colors.dim}(${item.employeeId})${colors.reset}`,
        item.date,
        formatViolation(item.type, colors.boldRed),
        item.explanation
      ]);
    }

    const header = `${colors.boldRed}● HIGH SEVERITY DISCREPANCIES (${grouped.HIGH.length})${colors.reset}\n` +
      `${colors.dim}Immediate review required — significant compliance, rest-period, or absence violations.${colors.reset}`;

    outputSections.push(`${header}\n${highTable.toString()}`);
  }

  // 3. Render MEDIUM Severity Table (Yellow)
  if (grouped.MEDIUM.length > 0) {
    const mediumTable = new Table(tableConfig);

    for (const item of grouped.MEDIUM) {
      mediumTable.push([
        `${colors.bold}${item.employeeName}${colors.reset}\n${colors.dim}(${item.employeeId})${colors.reset}`,
        item.date,
        formatViolation(item.type, colors.boldYellow),
        item.explanation
      ]);
    }

    const header = `${colors.boldYellow}▲ MEDIUM SEVERITY DISCREPANCIES (${grouped.MEDIUM.length})${colors.reset}\n` +
      `${colors.dim}Manager verification required — missing punches, leave conflicts, or severe tardiness.${colors.reset}`;

    outputSections.push(`${header}\n${mediumTable.toString()}`);
  }

  // Summary footer
  const total = anomalies.length;
  const footer = `${colors.cyan}Total Flagged Records:${colors.reset} ${total} ` +
    `(${colors.boldRed}${grouped.HIGH.length} High${colors.reset}, ` +
    `${colors.boldYellow}${grouped.MEDIUM.length} Medium${colors.reset})`;

  return `\n${outputSections.join('\n\n')}\n\n${footer}\n`;
}

/**
 * Prints the formatted color-coded cli-table3 view directly to the terminal.
 */
export function printAnomaliesTable(
  anomalies: (AttendanceAnomaly | EnrichedAttendanceAnomaly)[]
): void {
  console.log(formatAnomaliesTable(anomalies));
}

/**
 * Alternative zero-dependency renderer using native `console.table`.
 */
export function printAnomaliesConsoleTable(
  anomalies: (AttendanceAnomaly | EnrichedAttendanceAnomaly)[]
): void {
  const grouped = {
    HIGH: anomalies.filter((a) => normalizeSeverity(a.severity) === 'HIGH'),
    MEDIUM: anomalies.filter((a) => normalizeSeverity(a.severity) === 'MEDIUM')
  };

  (['HIGH', 'MEDIUM'] as const).forEach((sev) => {
    const items = grouped[sev];
    if (items.length === 0) return;

    const color = sev === 'HIGH' ? colors.boldRed : colors.boldYellow;
    console.log(`\n${color}=== ${sev} SEVERITY ANOMALIES (${items.length}) ===${colors.reset}`);

    console.table(
      items.map((item) => ({
        'Employee': `${item.employeeName} (${item.employeeId})`,
        'Date': item.date,
        'Violation': item.type,
        'AI Explanation': item.explanation
      }))
    );
  });
}


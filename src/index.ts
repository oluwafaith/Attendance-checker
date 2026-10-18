import { loadAttendanceCsv } from './utils/parseAttendance';
import { runRuleEngine } from './engine/ruleEngine';
import { AttendanceRecord } from './types/attendance';
import { explainAnomaliesWithGemini } from './services/aiService';
import { printAnomaliesTable } from './utils/tableFormatter';

async function main() {
  console.log('\n======================================================');
  console.log('   ATTENDANCE CHECKER - WORKFORCE COMPLIANCE AUDIT    ');
  console.log('======================================================');

  const csvPath = process.argv[2] || 'sample_attendance.csv';
  console.log(`\n[1/3] Loading attendance records from: ${csvPath}...`);
  const records = await loadAttendanceCsv(csvPath);

  // Add a synthetic record for SEVERE_TARDINESS to demonstrate all 5 core rules
  const tardyRecord: AttendanceRecord = {
    employeeId: 'EMP009',
    employeeName: 'Tom Bradley',
    department: 'Sales',
    date: '2026-10-15',
    scheduledHours: 8.0,
    clockIn: '11:15',
    clockOut: '17:30',
    breakMinutes: 30,
    actualHours: 5.75,
    leaveType: 'None',
    leaveHours: 0.0,
    isApproved: false
  };

  const allRecords = [...records, tardyRecord];
  console.log(`✓ Processed ${allRecords.length} records (${records.length} standard + 1 synthetic tardiness check).`);

  console.log('\n[2/3] Running deterministic rule engine (5 core compliance checks)...');
  const rawAnomalies = runRuleEngine(allRecords);
  console.log(`✓ Detected ${rawAnomalies.length} policy violations across shift records.`);

  console.log('\n[3/3] Enriching anomalies with Gemini AI (model: gemini-2.5-flash)...');
  const enrichedAnomalies = await explainAnomaliesWithGemini(rawAnomalies);
  console.log('✓ Generated professional single-sentence explanations and HR recommendations.');

  console.log('\nFinalized Terminal Review (Grouped by Severity):\n');
  printAnomaliesTable(enrichedAnomalies);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});


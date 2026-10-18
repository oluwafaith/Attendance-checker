import { loadAttendanceCsv } from './utils/parseAttendance';
import { runRuleEngine, calculateTimeDifference } from './engine/ruleEngine';
import { AttendanceRecord } from './types/attendance';
import { explainAnomaliesWithGemini } from './services/aiService';
import { printAnomaliesTable } from './utils/tableFormatter';

async function main() {
  console.log("--- 1. Testing Helper: calculateTimeDifference ---");
  const t1 = calculateTimeDifference("09:00", "17:30", 30); // 8.0 hours
  const t2 = calculateTimeDifference("06:00", "22:30", 30); // 16.0 hours
  const t3 = calculateTimeDifference("22:00", "06:00", 0); // 8.0 hours (overnight)
  console.log(`09:00 to 17:30 (30m break): ${t1}h (Expected: 8.0)`);
  console.log(`06:00 to 22:30 (30m break): ${t2}h (Expected: 16.0)`);
  console.log(`22:00 to 06:00 (overnight): ${t3}h (Expected: 8.0)`);

  console.log("\n--- 2. Loading CSV & Running Rule Engine ---");
  const records = await loadAttendanceCsv("sample_attendance.csv");

  // Add a synthetic record for SEVERE_TARDINESS to verify all 5 rules in action
  const tardyRecord: AttendanceRecord = {
    employeeId: "EMP009",
    employeeName: "Tom Bradley",
    department: "Sales",
    date: "2026-10-15",
    scheduledHours: 8.0,
    clockIn: "11:15",
    clockOut: "17:30",
    breakMinutes: 30,
    actualHours: 5.75,
    leaveType: "None",
    leaveHours: 0.0,
    isApproved: false,
  };

  const allRecords = [...records, tardyRecord];
  const anomalies = runRuleEngine(allRecords);

  console.log('\n--- 3. Enriching with AI Explanations & Formatting Terminal View ---');
  const enrichedAnomalies = await explainAnomaliesWithGemini(anomalies);
  printAnomaliesTable(enrichedAnomalies);
}

main().catch(console.error);

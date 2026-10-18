import { GoogleGenAI } from '@google/genai';
import { AttendanceAnomaly, EnrichedAttendanceAnomaly, AnomalyType } from '../types/attendance';

/**
 * Configuration options for the Gemini attendance explanation service.
 */
export interface GeminiServiceOptions {
  /** Gemini API key. Defaults to process.env.GEMINI_API_KEY if not specified. */
  apiKey?: string;
  /** Gemini model name. Defaults to 'gemini-2.5-flash'. */
  model?: string;
  /** Optional temperature. Defaults to 0.2 for consistent, objective analysis. */
  temperature?: number;
}

/**
 * Expected JSON structure for each item in the Gemini response array.
 */
interface GeminiAnomalyResponseItem {
  index?: number;
  employeeId?: string;
  date?: string;
  type?: string;
  explanation: string;
  hrRecommendation: string;
}

/**
 * Generates rule-based, deterministic single-sentence explanations and HR recommendations
 * when the Gemini API is unreachable, unauthenticated, or encounters an error.
 *
 * @param anomalies - Array of detected AttendanceAnomaly objects
 * @returns Array of EnrichedAttendanceAnomaly objects with standard explanations and recommendations
 */
export function generateFallbackAnomalies(anomalies: AttendanceAnomaly[]): EnrichedAttendanceAnomaly[] {
  return anomalies.map((anomaly) => {
    let explanation: string;
    let hrRecommendation: string;

    switch (anomaly.type) {
      case 'UNEXPLAINED_ABSENCE':
        explanation = `${anomaly.employeeName} (${anomaly.employeeId}) recorded no clock-in or clock-out punches on a scheduled ${anomaly.record.scheduledHours}h shift with no approved leave filed.`;
        hrRecommendation = 'Contact the employee to verify absence circumstances and request retroactive leave submission or medical documentation.';
        break;

      case 'MISSING_CLOCK_OUT':
        explanation = `${anomaly.employeeName} (${anomaly.employeeId}) clocked in at ${anomaly.record.clockIn} on ${anomaly.date} but failed to log a departure timestamp.`;
        hrRecommendation = 'Have the direct supervisor confirm actual departure time and submit an attendance punch correction form.';
        break;

      case 'EXCESSIVE_OVERTIME': {
        const hours = anomaly.record.actualHours > 0 ? anomaly.record.actualHours : 12;
        explanation = `${anomaly.employeeName} (${anomaly.employeeId}) recorded a shift duration exceeding the safe daily limit of 12.0 hours on ${anomaly.date}.`;
        hrRecommendation = 'Review overtime authorization with department manager and mandate adequate rest intervals before the employee’s next scheduled shift.';
        break;
      }

      case 'WORKING_ON_LEAVE':
        explanation = `${anomaly.employeeName} (${anomaly.employeeId}) recorded active work punches (${anomaly.record.clockIn} - ${anomaly.record.clockOut}) during approved ${anomaly.record.leaveType}.`;
        hrRecommendation = 'Verify with the employee whether the leave request should be cancelled or if worked hours should be credited as compensatory time.';
        break;

      case 'SEVERE_TARDINESS':
        explanation = `${anomaly.employeeName} (${anomaly.employeeId}) clocked in at ${anomaly.record.clockIn} on ${anomaly.date}, significantly past the morning start window without approved half-day leave.`;
        hrRecommendation = 'Conduct an informal attendance check-in to discuss recurring tardiness and evaluate schedule flexibility or formal warning.';
        break;

      default:
        explanation = anomaly.explanation || `Attendance anomaly flagged for ${anomaly.employeeName} on ${anomaly.date}.`;
        hrRecommendation = 'Conduct standard supervisor review to verify timesheet accuracy and policy compliance.';
        break;
    }

    return {
      ...anomaly,
      explanation,
      hrRecommendation
    };
  });
}

/**
 * Sends detected attendance anomalies to Gemini ('gemini-2.5-flash') to generate
 * professional single-sentence explanations and actionable HR recommendations.
 *
 * Uses `responseMimeType: 'application/json'` to enforce structured output,
 * and seamlessly falls back to rule-based explanations if the request fails.
 *
 * @param anomalies - Array of AttendanceAnomaly objects to enrich
 * @param options - Optional configuration (API key, model override)
 * @returns Promise resolving to an array of EnrichedAttendanceAnomaly objects
 */
export async function explainAnomaliesWithGemini(
  anomalies: AttendanceAnomaly[],
  options?: GeminiServiceOptions
): Promise<EnrichedAttendanceAnomaly[]> {
  // Guard clause: Return early if there is nothing to analyze
  if (!anomalies || anomalies.length === 0) {
    return [];
  }

  // Load environment variables if not already set (Node.js 20+ built-in)
  if (!process.env.GEMINI_API_KEY && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {
      // Ignore if .env doesn't exist
    }
  }

  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;

  // If no API key or placeholder key is present, gracefully use fallback
  if (!apiKey || apiKey === 'your_actual_api_key_here') {
    console.warn(
      '[geminiService] Valid GEMINI_API_KEY not found in environment or options. Using professional rule-based fallback.'
    );
    return generateFallbackAnomalies(anomalies);
  }

  const modelName = options?.model || 'gemini-2.5-flash';

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Prepare a clean, concise payload for the model
    const anomalyPayload = anomalies.map((a, index) => ({
      index,
      type: a.type,
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      department: a.record.department,
      date: a.date,
      scheduledHours: a.record.scheduledHours,
      actualHours: a.record.actualHours,
      clockIn: a.record.clockIn,
      clockOut: a.record.clockOut,
      breakMinutes: a.record.breakMinutes,
      leaveType: a.record.leaveType,
      leaveHours: a.record.leaveHours,
      currentRuleExplanation: a.explanation
    }));

    const prompt = `
You are an expert HR compliance advisor and workforce management analyst.
Analyze the following list of ${anomalies.length} attendance anomalies detected in the employee attendance system.

For EACH anomaly, generate:
1. "explanation": A polished, objective, professional single-sentence explanation of what occurred and why it is irregular.
2. "hrRecommendation": A clear, practical, actionable recommendation for HR or the line manager (e.g. documentation check, timesheet correction, rest period enforcement, or check-in meeting).

Input Anomalies:
${JSON.stringify(anomalyPayload, null, 2)}

Requirements:
- Return ONLY a JSON array with one object per anomaly, corresponding to the input items in the exact same index order.
- Each object MUST contain:
  - "index": number (0 to ${anomalies.length - 1})
  - "explanation": string (strictly one professional sentence)
  - "hrRecommendation": string (strictly one actionable sentence)
`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: options?.temperature ?? 0.2
      }
    });

    const responseText = response.text?.trim();
    if (!responseText) {
      throw new Error('Gemini returned an empty response text.');
    }

    const parsedResults: GeminiAnomalyResponseItem[] = JSON.parse(responseText);

    if (!Array.isArray(parsedResults) || parsedResults.length === 0) {
      throw new Error('Gemini response was not a valid non-empty JSON array.');
    }

    // Merge Gemini output back into the original anomaly objects
    const enriched: EnrichedAttendanceAnomaly[] = anomalies.map((original, i) => {
      // Find matching item by index, or position i as fallback
      const match =
        parsedResults.find((item) => item.index === i) ||
        parsedResults[i];

      if (match && match.explanation && match.hrRecommendation) {
        return {
          ...original,
          explanation: match.explanation.trim(),
          hrRecommendation: match.hrRecommendation.trim()
        };
      }

      // If specific item was missing in response, use item fallback
      const fallbackItem = generateFallbackAnomalies([original])[0];
      return fallbackItem;
    });

    return enriched;
  } catch (error) {
    console.warn(
      `[geminiService] Gemini API call failed (${(error as Error).message}). Activating fallback generator.`
    );
    return generateFallbackAnomalies(anomalies);
  }
}

/**
 * Convenient aliases for explainAnomaliesWithGemini.
 */
export const generateAnomalyExplanations = explainAnomaliesWithGemini;
export const generateAIExplanations = explainAnomaliesWithGemini;


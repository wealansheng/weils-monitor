import ErrorStackParser from 'error-stack-parser'
import type { ErrorReportData, ErrorStackFrame } from '@weils-monitor/shared'

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/** Parse generated locations only. Source maps stay on the monitoring server. */
export const parseErrorStack = (stack?: string): ErrorStackFrame[] => {
  if (!stack || !/(?:^|\n)\s*(?:at\s|[^\n]*@|(?:https?|file):\/\/)/.test(stack)) return []
  try {
    return ErrorStackParser.parse({ stack } as Error).map((frame) => ({
      filename: frame.fileName || undefined,
      lineno: positiveInteger(frame.lineNumber) ? frame.lineNumber : undefined,
      colno: positiveInteger(frame.columnNumber) ? frame.columnNumber : undefined,
      function_name: frame.functionName || undefined,
      raw: frame.source || frame.toString() || undefined,
    }))
  } catch {
    return []
  }
}

/** Enrich all error channels without replacing a valid caller-provided location. */
export const enrichErrorStack = <T extends ErrorReportData>(data: T): T => {
  const frames = data.stack_frames?.length ? data.stack_frames : parseErrorStack(data.stack)
  if (!frames.length) return data
  const first = frames.find((frame) => frame.filename && positiveInteger(frame.lineno) && positiveInteger(frame.colno))
  const hasLocation = data.filename && positiveInteger(data.lineno) && positiveInteger(data.colno)
  return {
    ...data,
    stack_frames: frames,
    ...(!hasLocation && first ? { filename: first.filename, lineno: first.lineno, colno: first.colno } : {}),
  }
}

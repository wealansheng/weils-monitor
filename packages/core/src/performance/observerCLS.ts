import type { CLSReportData, LayoutShiftEntry } from '@weils-monitor/shared';
import { SESSION_WINDOW_MAX_DURATION, SESSION_WINDOW_MAX_GAP } from '@weils-monitor/shared';
import { flushReportQueue, getRating } from '@weils-monitor/utils';
import { report } from '../report';

/** Start collecting layout shifts and return the current largest session window. */
const createCLSObserver = (): (() => number) | null => {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return null;
  }

  let currentWindowValue = 0;
  let currentWindowStart: number | null = null;
  let currentWindowLastEntryTime = 0;
  let maxWindowValue = 0;

  const handleLayoutShift = (entry: LayoutShiftEntry): void => {
    if (entry.hadRecentInput) return;

    const entryTime = entry.startTime;
    const isNewWindow =
      currentWindowStart === null ||
      entryTime - currentWindowLastEntryTime > SESSION_WINDOW_MAX_GAP ||
      entryTime - currentWindowStart > SESSION_WINDOW_MAX_DURATION;

    if (isNewWindow) {
      maxWindowValue = Math.max(maxWindowValue, currentWindowValue);
      currentWindowStart = entryTime;
      currentWindowValue = entry.value;
    } else {
      currentWindowValue += entry.value;
    }

    currentWindowLastEntryTime = entryTime;
  };

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LayoutShiftEntry[]) handleLayoutShift(entry);
  });

  try {
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    observer.disconnect();
    return null;
  }

  return () => {
    // Include entries that arrived just before the page became hidden.
    for (const entry of observer.takeRecords() as LayoutShiftEntry[]) handleLayoutShift(entry);
    return Math.max(maxWindowValue, currentWindowValue);
  };
};

export const observerHandler = (): (() => number) => createCLSObserver() ?? (() => 0);

export const observerCLS = (): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined' ||
      !('PerformanceObserver' in window) ||
      (PerformanceObserver.supportedEntryTypes &&
        !PerformanceObserver.supportedEntryTypes.includes('layout-shift'))) return;

  const getCLS = createCLSObserver();
  if (!getCLS) return;
  let reported = false;

  const finalize = (): void => {
    if (reported) return;
    reported = true;

    const value = getCLS();
    const reportData: CLSReportData = {
      event_type: 'performance',
      metric_name: 'CLS',
      value,
      rating: getRating(value),
    };
    report(reportData);

    // The exit flush listener was registered before this collector. Flush the
    // newly queued CLS event as well, even when it is the only event in a batch.
    void flushReportQueue({ transport: 'beacon' });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finalize();
  });
  window.addEventListener('pagehide', finalize);
};

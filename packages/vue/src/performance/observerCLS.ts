// CLS（Cumulative Layout Shift，累积布局偏移）
import type { LayoutShiftEntry } from '@weils-monitor/shared';
import { CLSReportData } from '@weils-monitor/shared';
import { SESSION_WINDOW_MAX_DURATION, SESSION_WINDOW_MAX_GAP } from '@weils-monitor/shared'
import { getRating } from '@weils-monitor/utils'

// 当前会话窗口状态
let currentWindowValue = 0;
let currentWindowStart = 0;
let currentWindowLastEntryTime = 0;
let maxWindowValue = 0;
let reported = false;

// 处理单个会话窗口
const handleLayoutShift = (entry: LayoutShiftEntry): void => {
    // 忽略用户交互触发的偏移（500ms 内）
  if (entry.hadRecentInput) return;

  const entryTime = entry.startTime;

  // 判断是否要开启新窗口
  const isNewWindow =
    currentWindowStart === 0 ||
    entryTime - currentWindowLastEntryTime > SESSION_WINDOW_MAX_GAP ||
    entryTime - currentWindowStart > SESSION_WINDOW_MAX_DURATION;

  if (isNewWindow) {
    // 结算上一个窗口
    if (currentWindowValue > maxWindowValue) {
      maxWindowValue = currentWindowValue;
    }
    // 开启新窗口
    currentWindowStart = entryTime;
    currentWindowValue = entry.value;
  } else {
    // 累积到当前窗口
    currentWindowValue += entry.value;
  }

  currentWindowLastEntryTime = entryTime;
}

/**
 * 获取当前 CLS 值（最大会话窗口值）
 */
const getCLSValue = (): number => {
  // 结算最后一个未关闭的窗口
  return Math.max(maxWindowValue, currentWindowValue);
}

/**
 * 启动 CLS 监控，返回获取当前 CLS 值的函数
 */
export const observerHandler = (): () => number => {
  if (!('PerformanceObserver' in window)) {
    console.warn('浏览器不支持 PerformanceObserver，无法监控 CLS');
    return () => 0;
  }

  const observer: PerformanceObserver = new PerformanceObserver((list: PerformanceObserverEntryList) => {
    const entries = list.getEntries() as LayoutShiftEntry[];
    for (const entry of entries) {
      handleLayoutShift(entry);
    }
  });

  observer.observe({
    type: 'layout-shift',
    buffered: true, // 捕获 SDK 加载前的偏移
  });

  return getCLSValue;
}

export const observeCLS = (): void => {
    const getCLS = observerHandler();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !reported) {
            const clsValue = getCLS();
            if (clsValue > 0) {
                const reportData: CLSReportData = {
                    type: 'performance',
                    subType: 'cls',
                    name: 'CLS',
                    value: clsValue,
                    rating: getRating(clsValue),
                    startTime: performance.now(),
                }
                console.log(reportData)
            // lazyReportBatch(reportData);
            }
        }
    });
}
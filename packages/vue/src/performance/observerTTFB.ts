import type { NavigationTimingEntry, ResourceTimingEntry, TTFBReportData } from '@weils-monitor/shared'


// 首次字节时间 (Time to First Byte, TTFB)，标准 <= 100ms
// 使用核心主文档标准公式

/**
 * 计算页面主文档的 TTFB
 * 通过 navigation timing entry 获取
 */
const getNavigationTTFB = (): number => {
  const [nav] = performance.getEntriesByType('navigation') as NavigationTimingEntry[];
  if (!nav) return 0;

  // TTFB = responseStart - startTime
  // startTime 对 navigation 来说通常是 0
  return nav.responseStart - nav.startTime;
}

/**
 * 计算单个资源的 TTFB
 */
function getResourceTTFB(entry: ResourceTimingEntry): number {
  return entry.responseStart - entry.startTime;
}

// 上报
/**
 * 上报页面主文档的 TTFB
 */
export function observeTTFB(
  callback: (reportData: TTFBReportData) => void,
): () => void {
  if (!('PerformanceObserver' in window)) {
    console.warn('浏览器不支持 PerformanceObserver，无法监控 TTFB');
    return () => {};
  }

  let reported = false;

  // 监听 navigation 完成
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries() as NavigationTimingEntry[];

    for (const entry of entries) {
      // 只处理主文档导航（type 可能是 'navigate' / 'reload' / 'back_forward'）
      if (entry.entryType !== 'navigation') continue;

      const ttfb = entry.responseStart - entry.startTime;

      const reportData: TTFBReportData = {
        type: 'performance',
        subType: 'ttfb',
        name: 'TTFB',
        value: ttfb,
        rating: ttfb,
        startTime: entry.startTime,
      };

      callback(reportData);
      reported = true;
    }

    if (reported) observer.disconnect();
  });

  observer.observe({ type: 'navigation', buffered: true });

  return () => observer.disconnect();
}
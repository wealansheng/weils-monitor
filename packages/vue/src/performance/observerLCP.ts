import type { ReportData } from '@weils-monitor/shared'

// 最大内容绘制时间 (Largest Contentful Paint, LCP)，标准 <= 2.5s
export const observerLCP = () => {
    const entryHandler: PerformanceObserverCallback = (entries: PerformanceObserverEntryList, observer: PerformanceObserver) => {
        if (observer) {
            observer.disconnect();
        } 
        for (const entry of entries.getEntries()) {
            const json = entry.toJSON();
            console.log(json);
            const reportData: ReportData = {
                ...json,
                type: 'performance',
                subType: 'largest-contentful-paint',
                pageURL: window.location.href,
            }
            console.log(reportData)
            // 发送数据 todo;
            // lazyReportBatch(reportData);
        }

    }
    // 统计和计算lcp的时间
    const observer: PerformanceObserver = new PerformanceObserver(entryHandler);
    // buffered: true 确保观察到所有paint事件
    observer.observe({type: 'largest-contentful-paint', buffered: true});
}

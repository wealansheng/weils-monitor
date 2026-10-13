import type { ReportData } from "@weils-monitor/shared";

// 首次内容绘制时间 (First Contentful Paint, FCP)，标准 <= 1s
export const observerFCP = () => {
    const entryHandler: PerformanceObserverCallback = (entries: PerformanceObserverEntryList, observer: PerformanceObserver): void => {
        for (const entry of entries.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
                observer.disconnect();
                const json = entry.toJSON();
                console.log(json);
                const reportData: ReportData = {
                    ...json,
                    type: 'performance',
                    subType: entry.name,
                    pageUrl: window.location.href,
                }
                console.log(reportData);
                
                // 发送数据 todo;
                // lazyReportBatch(reportData);
            }
        }

    }
    // 统计和计算fcp的时间
    const observer: PerformanceObserver = new PerformanceObserver(entryHandler);
    // buffered: true 确保观察到所有paint事件
    observer.observe({type: 'paint', buffered: true});
}
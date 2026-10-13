import type { ReportData } from '@weils-monitor/shared'

// 绘制时间 (Paint, Paint)，标准 <= 1s

export const observerPaint = () => {
	const entryHandler: PerformanceObserverCallback = (entries?: PerformanceObserverEntryList, observer?: PerformanceObserver) => {
		for (const entry of entries?.getEntries() || []) {
			if (entry.name === 'first-paint') {
				observer?.disconnect();
				const json = entry.toJSON();
				const reportData: ReportData = {
					...json,
					type: 'performance',
					subType: entry.name,
					pageURL: window.location.href,
				}
				// 先不发送数据，添加到栈/队列中，浏览器空闲在发送
				console.log(reportData);
				
			}
		}
	}

	const observer: PerformanceObserver = new PerformanceObserver(entryHandler);
	observer.observe({ type: 'paint', buffered: true });

}
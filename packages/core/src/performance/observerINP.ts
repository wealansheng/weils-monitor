import type { INPReportData, INPEntry } from "@weils-monitor/shared";
import { getINPRating } from '@weils-monitor/utils'
import { report } from '../report';


// 存储每个 interactionId 对应的最长事件时长
const interactionMap = new Map<number, number>();

/**
 * 计算并返回当前的 INP 值（第 98 百分位数）
 */
const getINPValue = (): number => {
  const durations = Array.from(interactionMap.values()).sort((a, b) => a - b);
  if (durations.length === 0) return 0;

  // 取第 98 百分位数
  const index = Math.floor((durations.length - 1) * 0.98);
  return durations[index];
}

export const observerINP = () => {
    if (!('PerformanceObserver' in window)) {
        console.warn('浏览器不支持 PerformanceObserver，无法监控 INP');
        return () => 0;
    }
    const observer = new PerformanceObserver((list) => {
        // 获取所有新的事件条目
        const entries = list.getEntries() as INPEntry[];

        entries.forEach((entry) => {
        // 只处理具有有效 interactionId 的事件（即用户交互）
        if (entry.interactionId > 0) {
                const currentMax = interactionMap.get(entry.interactionId) || 0;
                // 同一次交互中，保留最长的事件时长作为该次交互的延迟
                interactionMap.set(entry.interactionId, Math.max(currentMax, entry.duration));
            }
        });
    });

    observer.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16, // 降低捕获门槛，以收集更全面的交互数据
    } as PerformanceObserverInit);

    document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        const inpValue = getINPValue();
        if (inpValue > 0) {
            const reportData: INPReportData = {
                event_type: 'performance',
                metric_name: 'INP',
                value: inpValue,
                rating: getINPRating(inpValue),
            }

            report(reportData);
        }
        }
    });
}

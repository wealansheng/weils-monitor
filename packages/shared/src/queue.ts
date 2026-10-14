import type { QueueReportData } from './types';
import { deepCopy } from './deepCopy';

const queue: QueueReportData[] = [];

export function getCache(): QueueReportData[] {
  return deepCopy(queue);
}

export function addCache(data: QueueReportData): void {
  queue.push(data);
}

export function clearCache(): void {
  queue.length = 0;
}

/** 返回当前待上报数据量，不复制队列内容。 */
export function getCacheSize(): number {
  return queue.length;
}

/** 从队首取出最多 count 条数据，供批量发送使用。 */
export function takeCache(count: number): QueueReportData[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  return queue.splice(0, Math.floor(count));
}

/** 发送失败时把数据放回队首，保持原始上报顺序。 */
export function prependCache(data: QueueReportData[]): void {
  if (!data.length) return;
  queue.unshift(...data);
}

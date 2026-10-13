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
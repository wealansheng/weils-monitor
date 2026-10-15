import { config } from '@weils-monitor/shared';
import type { QueueReportData } from '@weils-monitor/shared';
import { flushReportQueue, lazyReportBatch } from '@weils-monitor/utils';
import { collectCommonFields } from './context';

/** SDK 每次把数据放进队列时派发的事件，便于调试面板或业务侧监听。 */
export const REPORT_EVENT = 'weils-monitor:report';

let exitFlushBound = false;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createEventId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

/** 在入队前生成最终事件，确保失败重试复用相同 event_id。 */
export const normalizeReportData = (data: QueueReportData): QueueReportData => {
  const timestamp = Number(data.timestamp);
  const eventId = typeof data.event_id === 'string' && UUID_PATTERN.test(data.event_id)
    ? data.event_id
    : createEventId();

  return {
    ...collectCommonFields(),
    ...data,
    event_id: eventId,
    timestamp: Number.isInteger(timestamp) && timestamp > 0 ? timestamp : Date.now(),
    app_id: String(data.app_id || config.appId || config.appKey || ''),
    projectName: String(config.projectName || ''),
  } as QueueReportData;
};

/**
 * vue 包唯一的上报出口：只负责把数据交给 `@weils-monitor/utils` 维护的队列。
 * 达到条数/体积阈值时由 utils 发送批量事件包；严重错误会立即冲刷。
 */
export const report = (data: QueueReportData): void => {
  const normalizedData = normalizeReportData(data);

  if (config.debug) {
    console.log('[weils-monitor]', normalizedData);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REPORT_EVENT, { detail: normalizedData }));
  }

  setupExitFlush();
  const isSevereError = normalizedData.event_type === 'error'
    && normalizedData.error_type !== 'resource_error';
  void lazyReportBatch(normalizedData, isSevereError);
};

/**
 * 页面退出时冲刷不足一个批次的剩余数据。
 * 正常情况下队列由条数或体积阈值触发发送，这里用于避免页面切换时丢数据。
 * install / init 以及第一次 report 都会调用，重复调用只会绑定一次。
 */
export const setupExitFlush = (): void => {
  if (exitFlushBound || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  exitFlushBound = true;

  const flush = (): void => {
    void flushReportQueue({ transport: 'beacon' });
  };

  window.addEventListener('pagehide', flush, true);
  window.addEventListener('beforeunload', flush, true);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') flush();
    },
    true,
  );
};

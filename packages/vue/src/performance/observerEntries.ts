import type { EntriesReportData } from '@weils-monitor/shared';

export const observerEntries = (): void => {
  if (document.readyState === 'complete') {
    observerEvent();
  } else {
    const onLoad = (): void => {
      observerEvent();
      window.removeEventListener('load', onLoad, true);
    };
    window.addEventListener('load', onLoad, true);
  }
}

export const observerEvent = (): void => {
  let observer: PerformanceObserver | null = null;

  const entryHandler = (list: PerformanceObserverEntryList): void => {
    // 断言成具体子类，才能访问 encodedBodySize 等属性
    const data = list.getEntries() as PerformanceResourceTiming[];

    for (const entry of data) {
      if (observer) {
        observer.disconnect();
      }

      const reportData: EntriesReportData = {
        name: entry.name,
        type: 'performance',
        subType: entry.entryType,
        sourceType: entry.initiatorType,
        duration: entry.duration,
        dns: entry.domainLookupEnd - entry.domainLookupStart,
        tcp: entry.connectEnd - entry.connectStart,
        redirect: entry.redirectEnd - entry.redirectStart,
        ttfb: entry.responseStart,
        protocol: entry.nextHopProtocol,
        responseBodySize: entry.encodedBodySize,
        responseHeaderSize: entry.transferSize - entry.encodedBodySize,
        transferSize: entry.transferSize,
        resourceSize: entry.decodedBodySize,
        startTime: performance.now(),
      };

    //   lazyReportBatch(reportData);
    }
  };

  observer = new PerformanceObserver(entryHandler);
  observer.observe({ type: 'resource', buffered: true });
}

export default observerEntries
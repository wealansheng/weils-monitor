import type { LoadReportData } from "@weils-monitor/shared";
// import { lazyReportBatch } from '../report';

export const observerLoad = (): void => {
  window.addEventListener(
    'pageshow',
    (event: PageTransitionEvent): void => {
      requestAnimationFrame((): void => {
        const reportData: LoadReportData = {
          type: 'performance',
          subType: 'load',
          pageURL: window.location.href,
          startTime: event.timeStamp,
        };
        // lazyReportBatch(reportData);
        console.log(reportData)
      });
    },
    true,
  );
};
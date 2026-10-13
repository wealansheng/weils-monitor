import type { RouteReportData } from '@weils-monitor/shared'
import { generateUniqueId } from '@weils-monitor/utils';
// import { lazyReportBatch } from '../report';

export const pageChange = (): void => {
  // hash 路由
  window.addEventListener(
    'hashchange',
    (event: HashChangeEvent): void => {
      console.error('hashchange', event);

      const reportData: RouteReportData = {
        from: event.oldURL,     // 原代码 form 是拼写错误
        to: event.newURL,
        type: 'behavior',
        subType: 'hashchange',
        startTime: performance.now(),
        uuid: generateUniqueId(),
      };
      console.log(reportData);
      
      // lazyReportBatch(reportData);
    },
    true,
  );

  // history 路由
  window.addEventListener(
    'popstate',
    (event: PopStateEvent): void => {
      console.error('popstate', event);

      const reportData: RouteReportData = {
        from: window.location.href,  // 见下方说明：需要靠外部变量记录 from
        to: window.location.href,
        type: 'behavior',
        subType: 'popstate',
        startTime: performance.now(),
        uuid: generateUniqueId(),
      };
      console.log(reportData);
      
      // lazyReportBatch(reportData);
    },
    true,
  );
};
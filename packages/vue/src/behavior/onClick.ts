import type { ClickReportData } from "@weils-monitor/shared";

export const click = (): void => {
  const events = ['mousedown', 'touchstart'] as const;

  events.forEach((eventType) => {
    window.addEventListener(eventType, (e: MouseEvent | TouchEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target?.tagName) return;

      const reportData: ClickReportData = {
        // scrollTop: document.documentElement.scrollTop,
        type: 'behavior',
        subType: 'click',
        target: target.tagName,
        startTime: e.timeStamp,
        innerHtml: target.innerHTML,
        outerHtml: target.outerHTML,
        width: target.offsetWidth,      // 原代码 with 是拼写错误
        height: target.offsetHeight,
        eventType,
        path: e.composedPath?.() ?? [], // 原代码 e.path 已废弃
      };
      console.log(reportData);
      
    //   lazyReportBatch(reportData);
    });
  });
}
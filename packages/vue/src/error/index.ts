import { AssetsErrorReportData, JSErrorReportData, PromiseErrorReportData } from "@weils-monitor/shared";

export const error = () => {

    // 捕获资源加载失败的错误：js css img
    window.addEventListener('error', (e: ErrorEvent): void => {
        // 资源错误：e.target 是具体元素（img/script/link 等）
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // 收窄为带 src 或 href 的元素
        const resourceEl = target as HTMLImageElement & HTMLLinkElement & HTMLScriptElement;
        const url = resourceEl.src || resourceEl.href;
        if (!url) return;

        const reportData: AssetsErrorReportData = {
            type: 'error',
            subType: 'resource',
            url,
            html: target.outerHTML,
            pageUrl: window.location.href,
            paths: e.composedPath?.() ?? [],
        };
        console.log(reportData)
        // lazyReportBatch(reportData);
    },true)


    // 捕获 js 错误
    window.onerror = (
        msg: string | Event,
        url?: string,
        lineNo?: number,
        columnNo?: number,
        error?: Error,
    ): void => {
        const reportData: JSErrorReportData = {
            type: 'error',
            subType: 'js',
            msg: String(msg),
            url,
            lineNo,
            columnNo,
            stack: error?.stack,
            pageUrl: window.location.href,
            startTime: performance.now(),
        };

        // lazyReportBatch(reportData);
    };


    // 捕获 promise 错误 async await
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent): void => {
        const reportData: PromiseErrorReportData = {
            type: 'error',
            subType: 'promise',
            reason: e.reason instanceof Error ? e.reason.stack : String(e.reason),
            pageUrl: window.location.href,
            startTime: e.timeStamp,
        };

        // lazyReportBatch(reportData);
    }, true);
}
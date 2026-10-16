import type { AssetsErrorReportData, JSErrorReportData, PromiseErrorReportData } from '@weils-monitor/shared';
import { report } from '../report';

export const error = () => {

    // 捕获资源加载失败的错误：js css img
    window.addEventListener('error', (e: ErrorEvent): void => {
        // 资源错误：e.target 是具体元素（img/script/link 等）
        const target = e.target as HTMLElement | null;
        if (!target || !target.tagName) return;

        // 收窄为带 src 或 href 的元素
        const resourceEl = target as HTMLImageElement & HTMLLinkElement & HTMLScriptElement;
        const url = resourceEl.src || resourceEl.href;
        if (!url) return;

        const reportData: AssetsErrorReportData = {
            event_type: 'error',
            error_type: 'resource_error',
            resource_url: url,
            resource_type: getResourceType(target),
            tag_name: target.tagName,
        };
        report(reportData);
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
            event_type: 'error',
            error_type: 'js_error',
            message: error?.message ?? String(msg),
            name: error?.name,
            filename: url,
            lineno: lineNo,
            colno: columnNo,
            stack: error?.stack,
        };

        report(reportData);
    };


    // 捕获 promise 错误 async await
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent): void => {
        const reportData: PromiseErrorReportData = {
            event_type: 'error',
            error_type: 'promise_error',
            reason: e.reason instanceof Error ? e.reason.message : String(e.reason),
            message: e.reason instanceof Error ? e.reason.message : String(e.reason),
            name: e.reason instanceof Error ? e.reason.name : undefined,
            stack: e.reason instanceof Error ? e.reason.stack : undefined,
        };

        report(reportData);
    }, true);
}

const getResourceType = (target: HTMLElement): string => {
    if (target instanceof HTMLScriptElement) return 'script';
    if (target instanceof HTMLLinkElement) return target.rel || 'link';
    if (target instanceof HTMLImageElement) return 'image';
    if (target instanceof HTMLAudioElement) return 'audio';
    if (target instanceof HTMLVideoElement) return 'video';
    return target.tagName.toLowerCase();
}

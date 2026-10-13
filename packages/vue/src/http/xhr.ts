import type { HTTPReportData, XHRWithMonitor } from '@weils-monitor/shared';

export const originalProto = XMLHttpRequest.prototype;
export const originalSend = originalProto.send;
export const originalOpen = originalProto.open;

export const overwriteOpenAndSend = (): void => {
    originalProto.open = function newOpen(this: XHRWithMonitor,method: string,url: string | URL,async: boolean = true,username?: string | null,password?: string | null,): void {
        this.url = String(url);
        this.method = method;
        originalOpen.apply(this, [method, url, async, username, password] as never);
    };

    originalProto.send = function newSend(this: XHRWithMonitor, ...args: Parameters<XMLHttpRequest['send']>): void {
        this.startTime = Date.now();

        const onLoaded = (): void => {
            this.endTime = Date.now();
            this.duration = this.endTime - this.startTime;

            const { url, method, startTime, endTime, duration, status } = this;

            const reportData: HTTPReportData = {
            status,
            duration,
            startTime,
            endTime,
            url,
            method: method.toUpperCase(),
            type: 'performance',
            success: status >= 200 && status < 300,
            subType: 'xhr',
            };

            // todo 发送数据
            console.log(reportData);
            // lazyReportBatch(reportData);

            this.removeEventListener('loadend', onLoaded, true);
        };

        this.addEventListener('loadend', onLoaded, true);
        originalSend.apply(this, args);
    };
}
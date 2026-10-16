import type { HTTPReportData, XHRWithMonitor } from '@weils-monitor/shared';
import { isMonitorRequest } from '../context';
import { report } from '../report';

export const originalProto = XMLHttpRequest.prototype;
export const originalSend = originalProto.send;
export const originalOpen = originalProto.open;

export const overwriteOpenAndSend = (): void => {
    originalProto.open = function newOpen(this: XHRWithMonitor,method: string,url: string | URL,async: boolean = true,username?: string | null,password?: string | null,): void {
        this.monitorUrl = String(url);
        this.monitorMethod = method;
        originalOpen.apply(this, [method, url, async, username, password] as never);
    };

    originalProto.send = function newSend(this: XHRWithMonitor, ...args: Parameters<XMLHttpRequest['send']>): void {
        if (this.monitorUrl && isMonitorRequest(this.monitorUrl)) {
            originalSend.apply(this, args);
            return;
        }

        this.monitorStartTime = Date.now();

        const onLoaded = (): void => {
            const duration = Date.now() - (this.monitorStartTime ?? Date.now());

            const reportData: HTTPReportData = {
            status_code: this.status,
            duration,
            url: this.monitorUrl ?? '',
            method: (this.monitorMethod ?? 'GET').toUpperCase(),
            event_type: 'request',
            success: this.status >= 200 && this.status < 300,
            };

            report(reportData);

            this.removeEventListener('loadend', onLoaded, true);
        };

        this.addEventListener('loadend', onLoaded, true);
        originalSend.apply(this, args);
    };
}

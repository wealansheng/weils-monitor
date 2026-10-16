import type { HTTPReportData } from '@weils-monitor/shared';
import { isMonitorRequest } from '../context';
import { report } from '../report';

const originalFetch = window.fetch;

export const overwriteFetch = (): void => {
    window.fetch = function newFetch(url: RequestInfo | URL, config?: RequestInit): Promise<Response> {
    const requestUrl = url instanceof Request ? url.url : String(url);
    const method = (config?.method ?? (url instanceof Request ? url.method : 'GET')).toUpperCase();
    if (isMonitorRequest(requestUrl)) return originalFetch(url, config);

    const startTime = Date.now();

    const reportData: Partial<HTTPReportData> = {
        event_type: 'request',
        url: requestUrl,
        method,
    };

    return originalFetch(url, config)
        .then((res: Response): Response => {
        const endTime = Date.now();
        reportData.duration = endTime - startTime;

        const data = res.clone();
        reportData.status_code = data.status;
        reportData.success = data.ok;

        report(reportData as HTTPReportData);
        return res;
        })
        .catch((err: unknown) => {
        const endTime = Date.now();
        reportData.duration = endTime - startTime;
        reportData.status_code = 0;
        reportData.success = false;

        report(reportData as HTTPReportData);

        throw err;
        });
    };
}

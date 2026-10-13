import type { HTTPReportData } from '@weils-monitor/shared';
// import { lazyReportBatch } from '../report';

const originalFetch = window.fetch;

export const overwriteFetch = (): void => {
    window.fetch = function newFetch(url: RequestInfo | URL, config?: RequestInit): Promise<Response> {
    const startTime = Date.now();

    const reportData: Partial<HTTPReportData> = {
        type: 'performance',
        subType: 'fetch',
        url: String(url),
        startTime,
        method: (config?.method ?? 'GET').toUpperCase(),
    };

    return originalFetch(url, config)
        .then((res: Response): Response => {
        const endTime = Date.now();
        reportData.endTime = endTime;
        reportData.duration = endTime - startTime;

        const data = res.clone();
        reportData.status = data.status;
        reportData.success = data.ok;

        // lazyReportBatch(reportData as FetchReportData);
        return res;
        })
        .catch((err: unknown) => {
        const endTime = Date.now();
        reportData.endTime = endTime;
        reportData.duration = endTime - startTime;
        reportData.status = 0;
        reportData.success = false;

        // lazyReportBatch(reportData as FetchReportData);

        throw err;
        });
    };
}
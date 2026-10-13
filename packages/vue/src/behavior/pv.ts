import { generateUniqueId } from '@weils-monitor/utils';
import type { PVReportData } from '@weils-monitor/shared'

export const pv = () => {
    const reportData: PVReportData = {
        type: 'behavior',
        subType: 'pv',
        startTime: performance.now(),
        pageUrl: window.location.href,
        referror: document.referrer,
        uuid: generateUniqueId(),
    }
    console.log(reportData);
    
    // lazyReportBatch(reportData)
}
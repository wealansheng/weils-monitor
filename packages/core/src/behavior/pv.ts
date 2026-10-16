import type { PVReportData } from '@weils-monitor/shared'
import { report } from '../report';

export const pv = () => {
    const reportData: PVReportData = {
        event_type: 'behavior',
        action: 'page_view',
        page_url: window.location.href,
        route: window.location.pathname,
        referrer: document.referrer,
    }

    report(reportData)
}

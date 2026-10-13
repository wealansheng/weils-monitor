import {
    EntriesReportData,
    LoadReportData,
    AssetsErrorReportData,
    JSErrorReportData,
    PromiseErrorReportData,
    ClickReportData,
    RouteReportData,
    PVReportData,
    HTTPReportData,
    XHRWithMonitor
} from './types/index'

export type QueueReportData = EntriesReportData | LoadReportData | AssetsErrorReportData | JSErrorReportData | PromiseErrorReportData | ClickReportData | RouteReportData | PVReportData | HTTPReportData | XHRWithMonitor

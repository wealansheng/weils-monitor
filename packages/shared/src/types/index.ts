export * from './vue'

export interface MonitorOptions {
  dsn: string
  env?: string
}



export interface EntriesReportData {
  name: string;
  type: string;
  subType: string;
  sourceType: string;
  duration: number;
  dns: number;
  tcp: number;
  redirect: number;
  ttfb: number;
  protocol: string;
  responseBodySize: number;
  responseHeaderSize: number;
  transferSize: number;
  resourceSize: number;
  startTime: number;
}

export interface LoadReportData {
  type: string;
  subType: string;
  pageURL: string;
  startTime: number;
}

export interface AssetsErrorReportData {
  type: string
  subType: string
  url: string
  html: string
  pageUrl: string
  paths: EventTarget[]
}

export interface JSErrorReportData {
  type: string;
  subType: string;
  msg: string;
  url: string | undefined;
  lineNo: number | undefined;
  columnNo: number | undefined;
  stack: string | undefined;
  pageUrl: string;
  startTime: number;
}

export interface PromiseErrorReportData {
  type: string;
  subType: string;
  reason: string | undefined;
  pageUrl: string;
  startTime: number;
}

export interface ClickReportData {
  type: string;
  subType: string;
  target: string;
  startTime: number;
  innerHtml: string;
  outerHtml: string;
  width: number;
  height: number;
  eventType: string;
  path: EventTarget[];
}

export interface RouteReportData {
  from: string;
  to: string;
  type: string;
  subType: string;
  startTime: number;
  uuid: string;
}

export interface PVReportData {
  type: string;
  subType: string;
  startTime: number;
  pageUrl: string;
  referror: string;
  uuid: string;
}

export interface HTTPReportData {
  status: number;
  duration: number;
  startTime: number;
  endTime: number;
  url: string | URL;
  method: string;
  type: string;
  success: boolean;
  subType: string;
}

export interface ReportData {
  duration: number
  entryType: string
  name: string
  navigationId: number
  paintTime: number
  presentationTime: number
  startTime: number,
  type: string,
  subType: string,
  pageURL: string,
  // startTime?: string,
}

export interface InitOptions {
  url: string;
  projectName: string;
  appId: string | number;
  userId: string | number;
  isImageUpload: boolean;
  batchSize: number;
}


export interface XHRWithMonitor extends XMLHttpRequest {
  url: string | URL;
  method: string;
  startTime: number;
  endTime: number;
  duration: number;
}
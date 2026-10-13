export interface VueReportData {
  type: string;
  subType: string;
  info: string;
  error: string | undefined;
  startTime: number;
  pageURL: string;
}
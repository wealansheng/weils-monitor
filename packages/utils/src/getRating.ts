import type { Rating } from '@weils-monitor/shared';

export const getRating = (value: number): Rating  => {
    if (value <= 0.1) return 'good';              // ≤ 0.1 良好
    if (value <= 0.25) return 'needs-improvement'; // 0.1 - 0.25 需改进
    return 'poor';                                 // > 0.25 差
}

export const getINPRating = (value: number): Rating => {
  if (value <= 200) return 'good';        // ≤ 200ms 为良好
  if (value <= 500) return 'needs-improvement'; // 200ms - 500ms 需要改进
  return 'poor';                           // > 500ms 为差
}

export const getTTFBRating = (value: number): Rating => {
  if (value <= 800) return 'good'
  if (value <= 1800) return 'needs-improvement'
  return 'poor'
}

/** 水合是客户端主线程工作，阈值与 INP 对齐：200ms / 500ms。 */
export const getHydrationRating = (value: number): Rating => {
  if (value <= 200) return 'good'
  if (value <= 500) return 'needs-improvement'
  return 'poor'
}

/** 服务端渲染耗时直接决定 TTFB，阈值 300ms / 1000ms。 */
export const getSSRRating = (value: number): Rating => {
  if (value <= 300) return 'good'
  if (value <= 1000) return 'needs-improvement'
  return 'poor'
}

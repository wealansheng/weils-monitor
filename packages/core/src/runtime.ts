import type { InitOptions } from '@weils-monitor/shared'
import { setConfig } from '@weils-monitor/utils'
import { createCollectorRegistry, report, setupExitFlush } from './reporter'
import { createReplayController } from './replay'

export type { ReportAdapter, ReportStrategy, ReportHandler, ReportDecorator } from './reporter'

/** Shared factory initialization; framework packages add their own collectors. */
export const createMonitorCore = (options: InitOptions) => {
  setConfig(options)
  setupExitFlush()
  const replay = createReplayController()
  if (options.replay?.enabled) void replay.start()
  return { report, collectors: createCollectorRegistry(), replay }
}

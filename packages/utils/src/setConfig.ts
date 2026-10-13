// import { InitOptions } from './../../shared/src/types';
import type { InitOptions } from '@weils-monitor/shared'
import { config } from '@weils-monitor/shared';

export function setConfig(options: Partial<InitOptions>): void {
  for (const key of Object.keys(options) as (keyof InitOptions)[]) {
    const value = options[key];
    if (value !== undefined) {
      config[key] = value as never;
    }
  }
}
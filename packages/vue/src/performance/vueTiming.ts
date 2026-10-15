import type { PerformanceReportData } from '@weils-monitor/shared';
import { nextTick } from 'vue';
import type { App, ComponentPublicInstance } from 'vue';
import { report } from '../report';
import { afterPaint } from './afterPaint';

const MAX_BUFFERED_EVENTS = 200;

interface TimingCollector {
  start(): void;
}

const collectors = new WeakMap<App, TimingCollector>();

const now = (): number => globalThis.performance?.now?.() ?? Date.now();

const componentName = (instance: ComponentPublicInstance): string => {
  const options = instance.$options as typeof instance.$options & { __name?: string };
  return options.name || options.__name || 'AnonymousComponent';
};

/** Install hooks before mount so a later monitor.observer() can replay early measurements. */
export const installVueTiming = (app: App): void => {
  if (collectors.has(app)) return;

  const mountStarts = new WeakMap<ComponentPublicInstance, number>();
  const updateStarts = new WeakMap<ComponentPublicInstance, number>();
  const buffered: PerformanceReportData[] = [];
  let active = false;
  let flushScheduled = false;
  let suppressReportUpdates = false;
  let firstScreenScheduled = false;

  const flush = (): void => {
    flushScheduled = false;
    if (!active || !buffered.length) return;

    const events = buffered.splice(0);
    suppressReportUpdates = true;
    for (const event of events) report(event);

    // Reporting can update a Vue debug panel. Ignore those updates to avoid
    // generating another render metric for each metric we just emitted.
    void nextTick().then(() => {
      suppressReportUpdates = false;
      if (buffered.length) scheduleFlush();
    });
  };

  const scheduleFlush = (): void => {
    if (!active || flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(flush);
  };

  const enqueue = (event: PerformanceReportData): void => {
    if (buffered.length >= MAX_BUFFERED_EVENTS) buffered.shift();
    buffered.push(event);
    scheduleFlush();
  };

  app.mixin({
    beforeMount(this: ComponentPublicInstance) {
      if (!suppressReportUpdates) mountStarts.set(this, now());
    },
    mounted(this: ComponentPublicInstance) {
      const start = mountStarts.get(this);
      if (start !== undefined) {
        mountStarts.delete(this);
        const duration = Math.max(0, now() - start);
        enqueue({
          event_type: 'performance',
          metric_name: 'vue_component_mount',
          name: componentName(this),
          value: duration,
          duration,
          start_time: start,
        });
      }

      if (this.$root !== this || firstScreenScheduled) return;
      firstScreenScheduled = true;
      void nextTick().then(() => afterPaint(() => {
        const value = now();
        enqueue({
          event_type: 'performance',
          metric_name: 'vue_first_screen',
          value,
          duration: value,
          start_time: 0,
        });
      }));
    },
    beforeUpdate(this: ComponentPublicInstance) {
      if (!suppressReportUpdates) updateStarts.set(this, now());
    },
    updated(this: ComponentPublicInstance) {
      const start = updateStarts.get(this);
      if (start === undefined) return;
      updateStarts.delete(this);
      if (suppressReportUpdates) return;

      const duration = Math.max(0, now() - start);
      enqueue({
        event_type: 'performance',
        metric_name: 'vue_component_update',
        name: componentName(this),
        value: duration,
        duration,
        start_time: start,
      });
    },
  });

  collectors.set(app, {
    start(): void {
      active = true;
      scheduleFlush();
    },
  });
};

export const startVueTiming = (app: App): void => {
  collectors.get(app)?.start();
};

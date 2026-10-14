import type { ClickReportData } from "@weils-monitor/shared";
import { report } from '../report';

export const click = (): void => {
    window.addEventListener('click', (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target?.tagName) return;

      const reportData: ClickReportData = {
        event_type: 'behavior',
        action: 'click',
        target: {
          selector: getCssPath(target),
          text: getSafeText(target),
          tag: target.tagName,
        },
      };

      report(reportData);
    });
}

/** 表单控件和可编辑区域不采集文本，避免泄露输入值、密码或验证码。 */
const getSafeText = (target: HTMLElement): string | undefined => {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  ) {
    return undefined;
  }

  const text = target.textContent?.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 120) : undefined;
}

/**
 * 生成元素的简短 CSS 选择器路径（最多 6 层）
 */
const getCssPath = (el: HTMLElement): string => {
  const parts: string[] = [];
  let node: HTMLElement | null = el;

  while (node && node.nodeType === 1 && parts.length < 6) {
    let selector = node.nodeName.toLowerCase();

    if (node.id) {
      selector += `#${node.id}`;
      parts.unshift(selector);
      break;
    }

    if (node.className && typeof node.className === 'string') {
      const cls = node.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) selector += `.${cls}`;
    }

    parts.unshift(selector);
    node = node.parentElement;
  }

  return parts.join(' > ');
}

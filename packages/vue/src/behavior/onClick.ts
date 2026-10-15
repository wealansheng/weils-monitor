import type { ClickReportData } from '@weils-monitor/shared';
import { report } from '../report';

const customClickAttributes = new Set<string>();
let listening = false;

/** Register an HTML attribute whose value becomes the click action. */
export const addClickHandler = (attribute: string): void => {
  const name = attribute.trim().toLowerCase();
  if (!name) throw new TypeError('Click attribute name cannot be empty');
  customClickAttributes.add(name);
};

const getCustomClick = (target: HTMLElement): { element: HTMLElement; action: string } | null => {
  for (let element: HTMLElement | null = target; element; element = element.parentElement) {
    for (const attribute of customClickAttributes) {
      const action = element.getAttribute(attribute);
      if (action) return { element, action };
    }
  }
  return null;
};

export const click = (): void => {
  if (listening) return;
  listening = true;

  window.addEventListener('click', (event: MouseEvent): void => {
    let element = event.target instanceof Element ? event.target : null;
    while (element && !(element instanceof HTMLElement)) element = element.parentElement;
    const target = element;
    if (!target) return;

    const customClick = getCustomClick(target);
    const reportTarget = customClick?.element ?? target;
    const reportData: ClickReportData = {
      event_type: 'behavior',
      action: customClick?.action ?? 'click',
      target: {
        selector: getCssPath(reportTarget),
        text: getSafeText(reportTarget),
        tag: reportTarget.tagName,
      },
    };

    report(reportData);
  });
};

/** Avoid collecting form values, passwords and editable text. */
const getSafeText = (target: HTMLElement): string | undefined => {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  ) return undefined;

  const text = target.textContent?.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 120) : undefined;
};

/** Build a short CSS selector path (at most six levels). */
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
};

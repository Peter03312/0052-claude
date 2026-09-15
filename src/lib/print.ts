import PrintCss from './print.css?inline';
import PrintPage from '../components/PrintPage.svelte';
import type { Solution, StoryDraft } from './types';

/** 把打印页 Svelte 组件渲染成静态 HTML（结构与屏幕组件单一来源；初次挂载为同步渲染） */
export function renderPrintHtml(draft: StoryDraft, solution: Solution): string {
  const container = document.createElement('div');
  const component = new PrintPage({
    target: container,
    props: { draft, solution }
  });
  const html = container.innerHTML;
  component.$destroy();
  return html;
}

/**
 * 在隐藏 iframe 里加载同源 srcdoc 并调起打印；
 * 全程不发起任何网络请求，断网可用。
 */
export function printOffline(docTitle: string, bodyInnerHtml: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-testid', 'print-frame');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${docTitle}</title><style>${PrintCss}</style></head><body>${bodyInnerHtml}</body></html>`;

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 500);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.focus();
    // 简单兜底：若浏览器拦住打印弹窗，iframe 仍会在 60 秒后自动移除
    try {
      win.onafterprint = cleanup;
      win.print();
    } catch {
      // 打印被拦截也不打扰孩子
    }
    setTimeout(cleanup, 60_000);
  };
  document.body.appendChild(iframe);
}

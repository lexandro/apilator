import type { Tab } from '../../../domain';

export function getTabTitle(tab: Tab): string {
  if (tab.name) return tab.name;

  if (tab.request.url) {
    try {
      const url = new URL(tab.request.url);
      return url.pathname || url.host;
    } catch {
      return tab.request.url.length > 20
        ? `${tab.request.url.slice(0, 20)}...`
        : tab.request.url;
    }
  }

  return 'New Request';
}

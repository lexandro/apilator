import type { Tab } from '../../domain';
import { getTabTitle } from './utils';

interface DragGhostProps {
  tab: Tab;
  x: number;
  y: number;
}

export function DragGhost({ tab, x, y }: DragGhostProps) {
  const method = tab.request.method.toLowerCase();
  const title = getTabTitle(tab);

  return (
    <div
      className="tab-drag-ghost"
      style={{
        left: x,
        top: y,
        '--tab-color': tab.color || undefined,
      } as React.CSSProperties}
    >
      {tab.pinned && <span className="tab-pin">📌</span>}
      <span className={`tab-method ${method}`}>{tab.request.method}</span>
      <span className="tab-title">{title}</span>
    </div>
  );
}

import { useCallback, useState } from 'react';
import type { Collection, CollectionNode } from '../../domain';
import './CollectionTree.css';

export type DropPosition = 'before' | 'after' | 'inside';

export interface DropTarget {
  nodeId: string;
  position: DropPosition;
}

interface CollectionTreeProps {
  collections: Collection[];
  selectedId?: string | null;
  onOpenRequest: (nodeId: string) => void;
  onToggleCollapsed: (containerId: string) => void;
  onMove: (nodeId: string, target: DropTarget) => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string, isContainer: boolean) => void;
}

/**
 * Dropping on the middle of a folder puts the node inside it; the top and bottom thirds
 * insert before or after instead, which is what makes reordering possible.
 */
export function dropPositionFor(
  offsetY: number,
  height: number,
  isContainer: boolean
): DropPosition {
  if (!isContainer) return offsetY < height / 2 ? 'before' : 'after';
  if (offsetY < height / 3) return 'before';
  if (offsetY > (height * 2) / 3) return 'after';
  return 'inside';
}

interface RowProps {
  id: string;
  name: string;
  depth: number;
  isContainer: boolean;
  isCollapsed?: boolean;
  isSelected?: boolean;
  method?: string;
  dragging: string | null;
  dropTarget: DropTarget | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent, id: string, isContainer: boolean) => void;
  onDrop: (event: React.DragEvent) => void;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

function Row({
  id,
  name,
  depth,
  isContainer,
  isCollapsed,
  isSelected,
  method,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onClick,
  onContextMenu,
}: RowProps) {
  const marker = dropTarget?.nodeId === id ? dropTarget.position : null;

  const classes = [
    'collection-row',
    isContainer ? 'collection-row--container' : 'collection-row--request',
    isSelected ? 'collection-row--selected' : '',
    dragging === id ? 'collection-row--dragging' : '',
    marker ? `collection-row--drop-${marker}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        onDragStart(id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, id, isContainer)}
      onDrop={onDrop}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={name}
    >
      {isContainer ? (
        <span className={`collection-row__chevron ${isCollapsed ? 'collapsed' : ''}`}>▾</span>
      ) : (
        <span className={`collection-row__method method-${(method ?? 'get').toLowerCase()}`}>
          {method ?? 'GET'}
        </span>
      )}
      <span className="collection-row__name">{name}</span>
    </div>
  );
}

export function CollectionTree({
  collections,
  selectedId,
  onOpenRequest,
  onToggleCollapsed,
  onMove,
  onContextMenu,
}: CollectionTreeProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const handleDragOver = useCallback(
    (event: React.DragEvent, id: string, isContainer: boolean) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const bounds = event.currentTarget.getBoundingClientRect();
      const position = dropPositionFor(event.clientY - bounds.top, bounds.height, isContainer);

      setDropTarget((current) =>
        current?.nodeId === id && current.position === position ? current : { nodeId: id, position }
      );
    },
    []
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const sourceId = event.dataTransfer.getData('text/plain') || dragging;

      if (sourceId && dropTarget && sourceId !== dropTarget.nodeId) {
        onMove(sourceId, dropTarget);
      }

      setDragging(null);
      setDropTarget(null);
    },
    [dragging, dropTarget, onMove]
  );

  const handleDragEnd = useCallback(() => {
    setDragging(null);
    setDropTarget(null);
  }, []);

  const renderNodes = (nodes: CollectionNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const common = {
        id: node.id,
        name: node.name,
        depth,
        dragging,
        dropTarget,
        onDragStart: setDragging,
        onDragEnd: handleDragEnd,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
      };

      if (node.kind === 'request') {
        return (
          <Row
            key={node.id}
            {...common}
            isContainer={false}
            isSelected={selectedId === node.id}
            method={node.request.method}
            onClick={() => onOpenRequest(node.id)}
            onContextMenu={(e) => onContextMenu(e, node.id, false)}
          />
        );
      }

      return (
        <div key={node.id} className="collection-branch">
          <Row
            {...common}
            isContainer
            isCollapsed={node.collapsed}
            onClick={() => onToggleCollapsed(node.id)}
            onContextMenu={(e) => onContextMenu(e, node.id, true)}
          />
          {!node.collapsed && renderNodes(node.children, depth + 1)}
        </div>
      );
    });

  return (
    <div className="collection-tree">
      {collections.map((collection) => (
        <div key={collection.id} className="collection-branch">
          <Row
            id={collection.id}
            name={collection.name}
            depth={0}
            isContainer
            isCollapsed={collection.collapsed}
            dragging={dragging}
            dropTarget={dropTarget}
            onDragStart={setDragging}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => onToggleCollapsed(collection.id)}
            onContextMenu={(e) => onContextMenu(e, collection.id, true)}
          />
          {!collection.collapsed && renderNodes(collection.children, 1)}
        </div>
      ))}
    </div>
  );
}

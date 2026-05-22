import { useEffect, useRef } from 'react';
import { Copy, EyeOff, Play, Plus, Trash2 } from 'lucide-react';
import { pushEscHandler } from '../lib/escStack';

export interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  disabled: boolean;
  onClose(): void;
  onRunFrom?(nodeId: string): void;
  onClone(nodeId: string): void;
  onDelete(nodeId: string): void;
  onCopy(nodeId: string): void;
  onToggleDisable(nodeId: string): void;
}

export function NodeContextMenu(props: NodeContextMenuProps) {
  const { x, y, nodeId, disabled, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);

  // Outside-click closes; Esc routes through the top-of-stack registry
  // so a ConfirmDialog opened from a menu item dismisses only the
  // dialog on Escape, not both layers.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCloseRef.current();
    };
    window.addEventListener('mousedown', onClick);
    const releaseEsc = pushEscHandler(() => onCloseRef.current());
    return () => {
      window.removeEventListener('mousedown', onClick);
      releaseEsc();
    };
  }, []);

  const items: Array<{
    label: string;
    icon: React.ReactNode;
    onClick(): void;
    danger?: boolean;
    hidden?: boolean;
  }> = [
    {
      label: 'Run from here',
      icon: <Play size={12} />,
      onClick: () => props.onRunFrom?.(nodeId),
      hidden: !props.onRunFrom,
    },
    {
      label: 'Clone',
      icon: <Plus size={12} />,
      onClick: () => props.onClone(nodeId),
    },
    {
      label: 'Copy',
      icon: <Copy size={12} />,
      onClick: () => props.onCopy(nodeId),
    },
    {
      label: disabled ? 'Enable' : 'Disable',
      icon: <EyeOff size={12} />,
      onClick: () => props.onToggleDisable(nodeId),
    },
    {
      label: 'Delete',
      icon: <Trash2 size={12} />,
      onClick: () => props.onDelete(nodeId),
      danger: true,
    },
  ];

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[160px] rounded-md border border-border-subtle bg-bg-panel py-1 text-[12px] text-text-primary shadow-xl"
    >
      {items
        .filter((it) => !it.hidden)
        .map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={() => {
              it.onClick();
              onClose();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-elevated ${
              it.danger ? 'text-rose-300 hover:text-rose-200' : ''
            }`}
          >
            {it.icon}
            {it.label}
          </button>
        ))}
    </div>
  );
}

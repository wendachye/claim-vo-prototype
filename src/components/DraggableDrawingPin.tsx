import { useCallback, type MouseEvent, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/react';
import type { DrawingPinPosition } from '../data/drawing-pin';

interface DraggableDrawingPinProps {
  id: string;
  position: DrawingPinPosition;
  label: string;
  className: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

export function DraggableDrawingPin({ id, position, label, className, selected, disabled, onSelect, children }: DraggableDrawingPinProps) {
  const { ref, handleRef, isDragSource } = useDraggable({ id, disabled });
  const setElement = useCallback((element: HTMLButtonElement | null) => { ref(element); handleRef(element); }, [ref, handleRef]);
  return <button
    ref={setElement}
    type="button"
    className={`${className}${isDragSource ? ' is-dragging' : ''}`}
    style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
    aria-label={label}
    aria-current={selected ? 'location' : undefined}
    aria-describedby="drawing-pin-help"
    aria-roledescription="draggable area pin"
    data-drawing-pin-id={id}
    onClick={onSelect}
  >{children}</button>;
}

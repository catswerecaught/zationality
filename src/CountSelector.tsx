import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

const counts = [4, 5, 6, 7, 8, 9, 10];
export default function CountSelector({ value, onChange, disabled }: {
  value: number; onChange: (value: number) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(value - 4);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open) options.current[activeIndex]?.focus({ preventScroll: true }); }, [open, activeIndex]);

  function show(index = value - 4) {
    setActiveIndex(index); setOpen(true);
  }
  function select(count: number) {
    onChange(count); setOpen(false); trigger.current?.focus({ preventScroll: true });
  }

  return <div className="candidate-select" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button type="button" className="count-trigger" ref={trigger} disabled={disabled}
      aria-label="召回候选回答数量" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      onClick={() => open ? setOpen(false) : show()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
        if (event.key === 'Escape') setOpen(false);
      }}><span>{value} 条</span><ChevronDown size={15} className={open ? 'count-chevron open' : 'count-chevron'}/></button>
    <div className="count-menu" data-open={open} inert={!open} aria-hidden={!open}>
      <div className="count-menu-label">候选回答</div>
      <div id={listId} role="listbox" aria-label="召回候选回答数量" onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(i => (i + 1) % counts.length); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(i => (i + counts.length - 1) % counts.length); }
        if (event.key === 'Home') { event.preventDefault(); setActiveIndex(0); }
        if (event.key === 'End') { event.preventDefault(); setActiveIndex(counts.length - 1); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
        if (event.key === 'Tab') setOpen(false);
      }}>
        {counts.map((count, index) => <button type="button" role="option" key={count}
          aria-selected={count === value} tabIndex={open && index === activeIndex ? 0 : -1}
          ref={element => { options.current[index] = element; }} onClick={() => select(count)}>
          <span>{count} 条回答</span>{count === value && <Check size={16}/>}</button>)}
      </div>
    </div>
  </div>;
}

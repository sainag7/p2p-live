/** Pull down at the top of Home to refresh; a little bus drives across while it updates. Touch only. */
import React, { useEffect, useRef, useState } from 'react';
import { Bus } from 'lucide-react';

const THRESHOLD = 64;
const MAX_PULL = 96;
const HOLD = 52;

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    // Listen on the Home scroll container so a pull only starts from the very top.
    const scroller = root.current?.parentElement;
    if (!scroller) return;
    let startY: number | null = null;
    let current = 0;
    let working = false;
    const set = (value: number) => { current = value; setPull(value); };
    const onStart = (e: TouchEvent) => {
      startY = !working && scroller.scrollTop <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { if (current) set(0); setDragging(false); return; }
      if (e.cancelable) e.preventDefault();
      setDragging(true);
      set(Math.min(MAX_PULL, dy * 0.5));
    };
    const onEnd = async () => {
      if (startY == null) return;
      startY = null;
      setDragging(false);
      if (current < THRESHOLD) { set(0); return; }
      working = true;
      setBusy(true);
      set(HOLD);
      await onRefreshRef.current().catch(() => undefined);
      working = false;
      setBusy(false);
      set(0);
    };
    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd);
    scroller.addEventListener('touchcancel', onEnd);
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const ready = pull >= THRESHOLD;
  return <div ref={root} className="ptr">
    <div className={`ptr-indicator${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`} style={{ height: pull }} aria-hidden="true">
      <span className="ptr-bus" style={busy ? undefined : { left: `calc(${Math.min(1, pull / THRESHOLD) * 50}% - 12px)` }}><Bus size={22} /></span>
      <span className="ptr-label">{busy ? 'Updating bus times…' : ready ? 'Release to refresh' : 'Pull to refresh'}</span>
    </div>
    {children}
  </div>;
}

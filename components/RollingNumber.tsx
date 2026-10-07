/** A value that rolls like a departure board when it changes: the old one slides up and out, the new one in. */
import React, { useEffect, useState } from 'react';
import './motion.css';

export function RollingNumber({ value }: { value: string | number }) {
  const [shown, setShown] = useState<{ current: string | number; previous: string | number | null }>({ current: value, previous: null });
  useEffect(() => { setShown(s => s.current === value ? s : { current: value, previous: s.current }); }, [value]);
  return <span className="roll">
    {shown.previous != null && <span key={`out-${shown.previous}-${shown.current}`} className="roll-out" aria-hidden="true"
      onAnimationEnd={() => setShown(s => ({ ...s, previous: null }))}>{shown.previous}</span>}
    <span key={`in-${shown.current}`} className={shown.previous != null ? 'roll-in' : undefined}>{shown.current}</span>
  </span>;
}

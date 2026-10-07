import React from 'react';

export function ArrivalSourceTag({ source }: { source: 'live' | 'scheduled' }) {
  if (source === 'live') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
        Live
      </span>
    );
  }
  return <span className="text-xs text-gray-500">Scheduled</span>;
}

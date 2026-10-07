import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { ClientLiveStatus } from '../types';
import { getLiveStatusMessage } from '../utils/liveStatus';

interface LiveStatusBannerProps {
  status: ClientLiveStatus;
  className?: string;
}

export function LiveStatusBanner({ status, className = '' }: LiveStatusBannerProps) {
  const message = getLiveStatusMessage(status);
  if (!message) return null;
  const warning = message.tone === 'warning';
  return (
    <div className={className}>
      <div
        role="status"
        className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
          warning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-700'
        }`}
      >
        {warning ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
        <span>{message.text}</span>
      </div>
    </div>
  );
}

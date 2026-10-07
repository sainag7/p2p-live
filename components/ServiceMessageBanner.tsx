import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTransit } from '../context/TransitProvider';
import { getBannerMessages } from '../utils/serviceMessages';
import { ROUTE_NAMES } from '../data/routes';

const DISMISSED_KEY = 'p2p-dismissed-service-messages';

function readDismissed(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function ServiceMessageBanner() {
  const { snapshot } = useTransit();
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const messages = getBannerMessages(snapshot?.messages ?? [], dismissed);
  if (messages.length === 0 && !snapshot?.messagesPending) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      // ignore storage errors
    }
  };

  return (
    <>
      {snapshot?.messagesPending && messages.length === 0 && <div role="status" className="rider-banner is-info pointer-events-auto">
        <p className="rider-banner-meta">Checking service notices…</p>
      </div>}
      {messages.map((m) => (
        <div key={m.id} role="status" className="rider-banner is-info pointer-events-auto">
          <button
            type="button"
            onClick={() => dismiss(m.id)}
            className="rider-banner-dismiss"
            aria-label="Dismiss service message"
          >
            <X size={14} />
          </button>
          <p className="rider-banner-title">{m.title}</p>
          {m.body && <p className="rider-banner-body">{m.body}</p>}
          {m.routeIds.length > 0 && (
            <p className="rider-banner-meta">{m.routeIds.map((r) => ROUTE_NAMES[r]).join(' · ')}</p>
          )}
        </div>
      ))}
    </>
  );
}

/** Shared public-rider header. */

import React from 'react';
import { Link } from 'react-router-dom';
import { LocateFixed } from 'lucide-react';

interface AppHeaderProps {
  loadingLoc?: boolean;
  compact?: boolean;
  home?: boolean;
}

export function AppHeader({ loadingLoc = false, compact = false, home = false }: AppHeaderProps) {
  return (
    <header
      className={`flex justify-between items-center z-10 shrink-0 ${
        home
          ? `home-header ${compact ? 'compact-passenger-header' : ''}`
          : compact
            ? 'min-h-11 py-2 px-4 bg-white/90 border-b border-black/5'
            : 'pt-12 pb-3 px-4 bg-white shadow-sm'
      }`}
      style={
        compact && !home
          ? { paddingTop: 'max(8px, env(safe-area-inset-top))', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className={`cursor-pointer flex ${compact ? 'flex-col items-start gap-0' : 'items-center gap-2'} outline-none focus-visible:ring-2 focus-visible:ring-[#007aff] focus-visible:ring-offset-2 rounded-lg`}
          aria-label="Go to homepage"
        >
          {home ? (
            <h1 className="home-wordmark text-p2p-blue">
              <em>
                P<span className="text-p2p-red">2</span>P
              </em>{' '}
              <span className="home-live text-p2p-black">Live</span>
            </h1>
          ) : (
            <h1 className="text-[17px] font-semibold tracking-tight text-p2p-blue">
              P<span className="text-p2p-red">2</span>P <span className="text-p2p-black">Live</span>
            </h1>
          )}
        </Link>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {loadingLoc && <LocateFixed className="animate-spin text-black/25 shrink-0" size={18} aria-hidden />}
      </div>
    </header>
  );
}

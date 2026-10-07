import React from 'react';
import { Home, Map } from 'lucide-react';
import type { ViewState } from '../types';
import './home.css';
import { preloadMap } from './MapRenderer';

interface BottomNavProps { currentView: ViewState; onChangeView: (view: ViewState) => void }
const items = [
  { view: 'list', label: 'Home', Icon: Home },
  { view: 'map', label: 'Map', Icon: Map },
] as const;

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChangeView }) => (
  <nav className="passenger-nav" aria-label="Main navigation">
    {items.map(({ view, label, Icon }) => {
      const active = currentView === view;
      return <button key={view} type="button" onPointerDown={view === 'map' ? preloadMap : undefined} onFocus={view === 'map' ? preloadMap : undefined} onClick={() => onChangeView(view)} aria-current={active ? 'page' : undefined}>
        <Icon size={26} strokeWidth={active ? 2 : 1.5} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
        <span>{label}</span>
      </button>;
    })}
  </nav>
);

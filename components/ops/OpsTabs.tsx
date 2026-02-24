/**
 * Top tabs for Admin/Manager dashboards: Dashboard, Fleet, Counts, Who's Driving, Complaints (with badge), Team.
 */

import React from 'react';

export type OpsTabId =
  | 'dashboard'
  | 'fleet'
  | 'counts'
  | 'driving'
  | 'timesheets'
  | 'schedule'
  | 'complaints'
  | 'notes'
  | 'team';

interface OpsTabsProps {
  active: OpsTabId;
  onSelect: (tab: OpsTabId) => void;
  complaintCount?: number;
}

const TABS: { id: OpsTabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'counts', label: 'Counts' },
  { id: 'driving', label: "Who's Driving" },
  { id: 'timesheets', label: 'Timesheets' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'complaints', label: 'Complaints' },
  { id: 'notes', label: 'Driver Notes' },
  { id: 'team', label: 'Team' },
];

export function OpsTabs({ active, onSelect, complaintCount = 0 }: OpsTabsProps) {
  return (
    <div className="border-b border-gray-200 bg-white shrink-0">
      <nav className="flex overflow-x-auto no-scrollbar gap-0" aria-label="Dashboard sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`relative px-4 py-3 text-sm font-semibold whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-p2p-blue/30 focus:ring-inset ${
              active === tab.id
                ? 'text-p2p-blue border-b-2 border-p2p-blue'
                : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
            }`}
          >
            {tab.label}
            {tab.id === 'complaints' && complaintCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-p2p-red/20 text-p2p-red text-xs font-bold">
                {complaintCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

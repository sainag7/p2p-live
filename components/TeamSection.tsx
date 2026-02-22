import React from 'react';
import { ProfileImage } from './ProfileImage';
import { TEAM_ADMINS, TEAM_MANAGERS, TEAM_DRIVERS } from '../data/team';

export const TeamSection: React.FC = () => {
  return (
    <div className="px-4 pb-24 pt-8">
      <h2 className="text-gray-900 font-bold text-lg mb-4">Transit team</h2>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Admins</p>
          <div className="flex flex-wrap gap-3">
            {TEAM_ADMINS.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm min-w-[200px]">
                <ProfileImage src={p.avatar} name={p.name} size="lg" />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">{p.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Managers</p>
          <div className="flex flex-wrap gap-3">
            {TEAM_MANAGERS.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm min-w-[200px]">
                <ProfileImage src={p.avatar} name={p.name} size="lg" />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">{p.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Drivers</p>
          <div className="flex flex-wrap gap-3">
            {TEAM_DRIVERS.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm min-w-[200px]">
                <ProfileImage src={p.avatar} name={p.name} size="lg" />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">{p.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

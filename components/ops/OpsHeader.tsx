/**
 * Shared ops header: breadcrumb (P2P Live | P2P Admin/Manager/Driver) + avatar + name + role chip + Log out.
 * Fixed height so content can use padding-top and scroll.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSession, logout, type Role } from '../../ops/auth';
import { getPerson, getDisplayName, getAvatarUrl } from '../../ops/peopleStore';
import { Avatar } from './Avatar';

const ROLE_TITLE: Record<Role, string> = {
  student: 'P2P Live',
  admin: 'P2P Admin',
  manager: 'P2P Manager',
  driver: 'P2P Driver',
};

const OPS_HEADER_HEIGHT_PX = 60;

export const OPS_HEADER_HEIGHT = OPS_HEADER_HEIGHT_PX;

export function OpsHeader() {
  const session = getSession();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/ops/login');
  };

  if (!session) return null;

  const role = session.user.role;
  const title = ROLE_TITLE[role];
  const person = getPerson(session.user.id);
  const displayName = person ? getDisplayName(person) : session.user.name;
  const avatarUrl = person ? getAvatarUrl(person) : undefined;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100 shadow-sm flex items-center justify-between px-4 h-[60px] shrink-0"
      style={{ height: OPS_HEADER_HEIGHT_PX }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to="/"
          className="cursor-pointer text-lg font-black text-p2p-blue tracking-tight shrink-0 outline-none focus:ring-2 focus:ring-p2p-blue focus:ring-offset-2 rounded"
          aria-label="Go to homepage"
        >
          P<span className="text-p2p-red">2</span>P <span className="text-p2p-black">Live</span>
        </Link>
        <span className="text-gray-300 shrink-0">|</span>
        <span className="font-bold text-gray-800 truncate">{title}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Avatar
          src={avatarUrl}
          alt={displayName}
          name={displayName}
          size="sm"
        />
        <span className="text-sm font-medium text-gray-700 truncate max-w-[120px] sm:max-w-[180px]">
          {displayName}
        </span>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-p2p-light-blue/50 text-p2p-blue capitalize shrink-0">
          {role}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-p2p-light-red/30 hover:text-p2p-red focus:outline-none focus:ring-2 focus:ring-p2p-red/30 shrink-0"
        >
          Log out
        </button>
      </div>
    </header>
  );
}

/**
 * Shared header: logo, UNC pill, and P2P Login entrypoint.
 * When logged out: "P2P Login" button. When student: name + dropdown (Log out).
 * When admin/manager/driver: "P2P Admin" link + name + role chip + Log out.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LocateFixed, LogOut, ChevronDown } from 'lucide-react';
import { getSession, logout } from '../ops/auth';

interface AppHeaderProps {
  loadingLoc?: boolean;
}

export function AppHeader({ loadingLoc = false }: AppHeaderProps) {
  const session = getSession();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    navigate('/');
  };

  return (
    <header className="bg-white border-b border-gray-100 pt-12 pb-3 px-4 flex justify-between items-center shadow-sm z-10 shrink-0">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className="cursor-pointer flex items-center gap-2 outline-none focus:ring-2 focus:ring-p2p-blue focus:ring-offset-2 rounded"
          aria-label="Go to homepage"
        >
          <h1 className="text-2xl font-black text-p2p-blue tracking-tight">
            P<span className="text-p2p-red">2</span>P <span className="text-p2p-black">Live</span>
          </h1>
          <span className="px-2 py-0.5 bg-p2p-light-red/30 text-p2p-red text-[10px] font-bold uppercase rounded-full tracking-wide">
            UNC Chapel Hill
          </span>
        </Link>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {loadingLoc && <LocateFixed className="animate-spin text-gray-300 shrink-0" size={20} aria-hidden />}
        {session ? (
          <>
            {session.user.role === 'student' ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-p2p-light-blue/50 text-p2p-blue text-sm font-semibold hover:bg-p2p-light-blue/70 focus:outline-none focus:ring-2 focus:ring-p2p-blue focus:ring-offset-2"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                >
                  {session.user.name}
                  <ChevronDown size={16} className={dropdownOpen ? 'rotate-180' : ''} />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 py-1 w-40 bg-white rounded-xl border border-gray-100 shadow-lg z-20">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 focus:outline-none focus:bg-gray-50"
                    >
                      <LogOut size={16} />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to={session.user.role === 'admin' ? '/ops/admin' : session.user.role === 'manager' ? '/ops/manager' : '/ops/driver'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-p2p-light-blue/50 text-p2p-blue text-sm font-semibold hover:bg-p2p-light-blue/70 focus:outline-none focus:ring-2 focus:ring-p2p-blue focus:ring-offset-2"
                >
                  P2P Admin
                  <span className="hidden sm:inline text-xs capitalize">({session.user.role})</span>
                </Link>
                <span className="hidden sm:inline text-sm text-gray-600">{session.user.name}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-p2p-blue/20 text-p2p-blue capitalize">
                  {session.user.role}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-gray-500 hover:bg-p2p-light-red/30 hover:text-p2p-red focus:outline-none focus:ring-2 focus:ring-p2p-red/30"
                  aria-label="Log out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            )}
          </>
        ) : (
          <Link
            to="/ops/login"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-p2p-blue text-white text-sm font-bold hover:bg-p2p-blue/90 focus:outline-none focus:ring-2 focus:ring-p2p-blue focus:ring-offset-2 active:scale-[0.98] transition-transform"
          >
            P2P Login
          </Link>
        )}
      </div>
    </header>
  );
}

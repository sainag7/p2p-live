// People with profile photos (admins, managers, drivers). Use same avatar URLs across admin/driver app.

export interface TeamPerson {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'driver';
  avatar: string;
}

export const TEAM_ADMINS: TeamPerson[] = [
  { id: 'a1', name: 'Admin User', email: 'admin@p2p.demo', role: 'admin', avatar: 'https://i.pravatar.cc/128?img=1' },
  { id: 'a2', name: 'Alex Rivera', email: 'arivera@unc.edu', role: 'admin', avatar: 'https://i.pravatar.cc/128?img=8' },
];

export const TEAM_MANAGERS: TeamPerson[] = [
  { id: 'm1', name: 'Sarah Johnson', email: 'sarah.j@unc.edu', role: 'manager', avatar: 'https://i.pravatar.cc/128?img=5' },
  { id: 'm2', name: 'David Park', email: 'd.park@unc.edu', role: 'manager', avatar: 'https://i.pravatar.cc/128?img=12' },
  { id: 'm3', name: 'Emily Walsh', email: 'e.walsh@unc.edu', role: 'manager', avatar: 'https://i.pravatar.cc/128?img=9' },
  { id: 'm4', name: 'Jordan Lee', email: 'jlee@unc.edu', role: 'manager', avatar: 'https://i.pravatar.cc/128?img=14' },
];

export const TEAM_DRIVERS: TeamPerson[] = [
  { id: 'd1', name: 'Maria Santos', email: 'maria.santos@unc.edu', role: 'driver', avatar: 'https://i.pravatar.cc/128?img=5' },
  { id: 'd2', name: 'James Chen', email: 'james.chen@unc.edu', role: 'driver', avatar: 'https://i.pravatar.cc/128?img=12' },
  { id: 'd3', name: 'Alex Rivera', email: 'alex.rivera@unc.edu', role: 'driver', avatar: 'https://i.pravatar.cc/128?img=8' },
];

export const ALL_TEAM = [...TEAM_ADMINS, ...TEAM_MANAGERS, ...TEAM_DRIVERS];

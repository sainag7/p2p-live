// utils/api.ts
// Trim so spaced `.env` lines like `VITE_API_BASE_URL = …` still resolve.
function envUrl(key: string): string {
  const raw = (import.meta as any).env?.[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

export const API = envUrl('VITE_API_BASE_URL');

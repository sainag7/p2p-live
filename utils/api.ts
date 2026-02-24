// utils/api.ts
export const API =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  (import.meta as any).env?.VITE_OPS_API_URL ||
  '';
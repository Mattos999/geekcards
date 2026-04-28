import axios from "axios";

const rawBackendUrl = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const isBrowser = typeof window !== "undefined";
const isLocalPage = isBrowser && ["localhost", "127.0.0.1"].includes(window.location.hostname);
const isLocalBackend = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(rawBackendUrl);
const BACKEND_URL = rawBackendUrl && (!isLocalBackend || isLocalPage) ? rawBackendUrl : "";
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Attach token from localStorage if available as fallback
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "Erro desconhecido";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e.msg || JSON.stringify(e)).join(", ");
  return String(detail);
}

export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/api")) return BACKEND_URL ? `${BACKEND_URL}${path}` : path;
  return `${API}/files/${path}`;
}

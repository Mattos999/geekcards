import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Library, Layers, LogOut, Plus, Sparkles, Shield } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Toaster } from "./ui/sonner";

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard" },
    { to: "/cards", icon: Library, label: "Biblioteca", testid: "nav-cards" },
    { to: "/decks", icon: Layers, label: "Meus Decks", testid: "nav-decks" },
    { to: "/naturezas", icon: Shield, label: "Naturezas", testid: "nav-naturezas" },
  ];

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-950/80 glass sticky top-0 h-screen flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366F1, #EC4899)" }}>
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <div className="text-lg font-bold" style={{ fontFamily: "Outfit" }}>Geek Cards</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Deck Manager</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {links.map(({ to, icon: Icon, label, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={testid}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30" : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => navigate("/cards/new")}
            data-testid="nav-create-card"
            className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 transition-colors"
          >
            <Plus size={16} />
            Nova Carta
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-2">Conectado como</div>
          <div className="text-sm font-medium text-white truncate mb-3">{user?.name}</div>
          <button
            onClick={async () => { await logout(); navigate("/login"); }}
            data-testid="logout-btn"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 grain">
        {children}
      </main>

      <Toaster position="top-right" theme="dark" />
    </div>
  );
};

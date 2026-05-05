import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Library, Layers, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Sparkles, Shield, Swords, Users, ShieldCheck, UserCog } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Toaster } from "./ui/sonner";
import { toast } from "sonner";
import { ProfileModal } from "./ProfileModal";
import { api } from "../lib/api";

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = window.localStorage.getItem("geekcards-sidebar-collapsed");
    return saved === null ? location.pathname.startsWith("/duelo") : saved === "true";
  });
  const onlineDuelSnapshotRef = useRef(new Map());

  useEffect(() => {
    window.localStorage.setItem("geekcards-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const openOnlineDuel = useCallback(duelId => {
    navigate(`/duelo?online=${duelId}`);
  }, [navigate]);

  const showDuelToast = useCallback(({ key, title, description, duelId, tone = "indigo" }) => {
    const storageKey = `geekcards-online-duel-toast-${key}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
    toast.custom(t => (
      <button
        type="button"
        onClick={() => {
          toast.dismiss(t);
          openOnlineDuel(duelId);
        }}
        className={`w-80 rounded-xl border bg-slate-950 p-4 text-left shadow-2xl shadow-black/50 ${
          tone === "rose" ? "border-rose-400/35" : tone === "emerald" ? "border-emerald-400/35" : "border-indigo-400/35"
        }`}
      >
        <div className="flex items-center gap-2">
          <Swords size={16} className={tone === "rose" ? "text-rose-300" : tone === "emerald" ? "text-emerald-300" : "text-indigo-300"} />
          <div className="text-sm font-black text-slate-100">{title}</div>
        </div>
        <div className="mt-1 text-xs text-slate-400">{description}</div>
        <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-indigo-200">Clique para abrir o duelo</div>
      </button>
    ), { duration: 12000 });
  }, [openOnlineDuel]);

  useEffect(() => {
    if (!user) return undefined;

    const pollOnlineDuels = async () => {
      try {
        const { data } = await api.get("/duels/online");
        const current = new Map((data || []).map(duel => [duel.id, duel]));
        const previous = onlineDuelSnapshotRef.current;
        const outsideDuelPage = location.pathname !== "/duelo";

        current.forEach(duel => {
          const previousDuel = previous.get(duel.id);
          const opponentName = duel.opponent?.name || "Oponente";
          const isInviteForMe = duel.status === "invited" && duel.invitee_id === user.id;
          if (isInviteForMe && !previousDuel) {
            showDuelToast({
              key: `invite-${duel.id}`,
              title: "Convite de duelo",
              description: `${opponentName} te convidou para um duelo online.`,
              duelId: duel.id,
              tone: "indigo",
            });
          }

          const acceptedMyInvite = (
            outsideDuelPage &&
            previousDuel?.status === "invited" &&
            duel.status !== "invited" &&
            duel.inviter_id === user.id
          );
          if (acceptedMyInvite) {
            showDuelToast({
              key: `accepted-${duel.id}-${duel.status}`,
              title: "Convite aceito",
              description: `${opponentName} aceitou seu convite. Escolha seu deck para continuar.`,
              duelId: duel.id,
              tone: "emerald",
            });
          }
        });

        previous.forEach((duel, duelId) => {
          const wasDeclinedOrCanceled = (
            outsideDuelPage &&
            duel.status === "invited" &&
            duel.inviter_id === user.id &&
            !current.has(duelId)
          );
          if (wasDeclinedOrCanceled) {
            showDuelToast({
              key: `declined-${duelId}`,
              title: "Convite recusado",
              description: `${duel.opponent?.name || "Oponente"} recusou ou cancelou o convite.`,
              duelId,
              tone: "rose",
            });
          }
        });

        onlineDuelSnapshotRef.current = current;
      } catch {
        // Ignore polling errors; regular pages already surface explicit API actions.
      }
    };

    pollOnlineDuels();
    const interval = window.setInterval(pollOnlineDuels, 5000);
    return () => window.clearInterval(interval);
  }, [location.pathname, showDuelToast, user]);

  const links = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard" },
    { to: "/cards", icon: Library, label: "Biblioteca", testid: "nav-cards" },
    { to: "/decks", icon: Layers, label: "Meus Decks", testid: "nav-decks" },
    { to: "/duelo", icon: Swords, label: "Duelo", testid: "nav-duel" },
    { to: "/comunidade", icon: Users, label: "Comunidade", testid: "nav-community" },
    { to: "/naturezas", icon: Shield, label: "Naturezas", testid: "nav-naturezas" },
  ];
  if (user?.role === "admin") {
    links.push({ to: "/admin/moderacao", icon: ShieldCheck, label: "Moderação", testid: "nav-admin" });
  }

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-20" : "w-64"} shrink-0 border-r border-slate-800 bg-slate-950/80 glass sticky top-0 h-screen flex flex-col transition-[width] duration-200`}>
        <div className={`${collapsed ? "p-4" : "p-6"} border-b border-slate-800`}>
          <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366F1, #EC4899)" }}>
              <Sparkles size={18} className="text-white" />
            </div>
            <div className={collapsed ? "hidden" : ""}>
              <div className="text-lg font-bold" style={{ fontFamily: "Outfit" }}>Geek Cards</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Deck Manager</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(current => !current)}
            title={collapsed ? "Expandir menu" : "Colapsar menu"}
            className={`mt-4 flex w-full items-center rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400 transition-colors hover:text-white ${collapsed ? "justify-center" : "gap-2"}`}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            {!collapsed && "Colapsar"}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {links.map(({ to, icon: Icon, label, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={testid}
              title={collapsed ? label : undefined}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${collapsed ? "justify-center" : ""} ${
                isActive ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30" : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <Icon size={16} />
              {!collapsed && label}
            </NavLink>
          ))}
          <button
            onClick={() => navigate("/cards/new")}
            data-testid="nav-create-card"
            title={collapsed ? "Nova Carta" : undefined}
            className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 transition-colors"
          >
            <Plus size={16} />
            {!collapsed && "Nova Carta"}
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          {!collapsed && <div className="text-xs text-slate-500 mb-2">Conectado como</div>}
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            title={collapsed ? user?.name : undefined}
            className={`mb-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-white transition-colors hover:bg-slate-800/70 ${collapsed ? "justify-center" : ""}`}
          >
            <UserCog size={14} className="shrink-0 text-indigo-300" />
            {!collapsed && <span className="truncate">{user?.name}</span>}
          </button>
          <button
            onClick={async () => { await logout(); navigate("/login"); }}
            data-testid="logout-btn"
            title={collapsed ? "Sair" : undefined}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${collapsed ? "justify-center" : ""}`}
          >
            <LogOut size={14} /> {!collapsed && "Sair"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 grain">
        {children}
      </main>

      <Toaster position="top-right" theme="dark" />

      {profileOpen && (
        <ProfileModal onClose={() => setProfileOpen(false)} />
      )}
    </div>
  );
};

import React, { useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  ShieldOff,
  UserCog,
  X,
} from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

export function ProfileModal({ onClose }) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [roleSaving, setRoleSaving] = useState(null);

  useEffect(() => {
    if (user?.role !== "admin") return;

    const loadUsers = async () => {
      setLoadingUsers(true);
      setUsersError("");
      try {
        const { data } = await api.get("/admin/users");
        setUsers(data);
      } catch (e) {
        const message = formatApiError(e);
        setUsersError(message);
        toast.error(message);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, [user?.role]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const saveProfile = async event => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error("Informe seu nome");
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      toast.error("A confirmacao da senha nao confere");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        current_password: currentPassword || null,
        new_password: newPassword || null,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Perfil atualizado");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (targetUser, role) => {
    setRoleSaving(targetUser.id);
    try {
      const { data } = await api.put(`/admin/users/${targetUser.id}/role`, { role });
      setUsers(list => list.map(item => item.id === data.id ? data : item));
      toast.success(role === "admin" ? `${data.name} agora e admin` : `${data.name} voltou para usuario`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setRoleSaving(null);
    }
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
  const labelCls = "block text-xs text-slate-400 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Editar perfil"
    >
      <div
        className="glass relative my-auto w-full max-w-3xl rounded-xl p-5 shadow-2xl sm:p-6"
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-slate-400 transition-colors hover:text-white"
          aria-label="Fechar perfil"
        >
          <X size={18} />
        </button>

        <div className="mb-5 pr-12">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-indigo-400">
            <UserCog size={15} />
            Perfil
          </div>
          <h2 className="mt-1 text-2xl font-bold" style={{ fontFamily: "Outfit" }}>
            Editar conta
          </h2>
          <p className="mt-1 text-sm text-slate-400">{user?.email}</p>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className={labelCls}>Nome</label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className={inputCls}
              autoFocus
            />
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <KeyRound size={15} className="text-indigo-300" />
              Alterar senha
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Senha atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  className={inputCls}
                  autoComplete="current-password"
                />
              </div>

              <div>
                <label className={labelCls}>Nova senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  className={inputCls}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className={labelCls}>Confirmar</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  className={inputCls}
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar perfil
          </button>
        </form>

        {user?.role === "admin" && (
          <section className="mt-6 border-t border-slate-800 pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
                  <ShieldCheck size={16} className="text-emerald-300" />
                  Permissoes de usuarios
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Promova outros usuarios para admin ou remova essa permissao.
                </p>
              </div>
              {loadingUsers && <Loader2 size={16} className="animate-spin text-indigo-300" />}
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-800">
              {users.map(account => {
                const isSelf = account.id === user.id;
                const isAdmin = account.role === "admin";

                return (
                  <div
                    key={account.id}
                    className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/50 p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">{account.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isAdmin ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/60 text-slate-300"}`}>
                          {isAdmin ? "admin" : "usuario"}
                        </span>
                        {isSelf && (
                          <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                            voce
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-slate-500">{account.email}</div>
                    </div>

                    <button
                      type="button"
                      disabled={isSelf || roleSaving === account.id}
                      onClick={() => changeRole(account, isAdmin ? "user" : "admin")}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        isAdmin
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                      }`}
                    >
                      {roleSaving === account.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : isAdmin ? (
                        <ShieldOff size={14} />
                      ) : (
                        <ShieldCheck size={14} />
                      )}
                      {isAdmin ? "Remover admin" : "Tornar admin"}
                    </button>
                  </div>
                );
              })}

              {!loadingUsers && users.length === 0 && (
                <div className="p-4 text-sm text-slate-400">
                  {usersError || "Nenhum usuario encontrado."}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, formatApiError } from "../lib/auth";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Senha deve ter ao menos 6 caracteres"); return; }
    setLoading(true);
    try {
      await register(name, email, password);
      toast.success("Conta criada!");
      navigate("/");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
         style={{ background: "radial-gradient(ellipse at top, #4C1D95 0%, #020617 70%)" }}>
      <div className="relative w-full max-w-md glass rounded-2xl p-8 animate-fade-in-up">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366F1, #EC4899)" }}>
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "Outfit" }}>Geek Cards</h1>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Deck Manager</div>
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-1" style={{ fontFamily: "Outfit" }}>Criar conta</h2>
        <p className="text-slate-400 text-sm mb-6">Comece a montar seus decks em segundos.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Nome</label>
            <input type="text" data-testid="register-name" value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Email</label>
            <input type="email" data-testid="register-email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Senha</label>
            <input type="password" data-testid="register-password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
          </div>
          <button type="submit" data-testid="register-submit" disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-6 py-3 font-medium transition-colors border border-indigo-500 disabled:opacity-50">
            {loading ? "Criando..." : "Criar Conta"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          Já tem conta?{" "}
          <Link to="/login" data-testid="link-login" className="text-indigo-400 hover:text-indigo-300 font-medium">Entrar</Link>
        </div>
      </div>
    </div>
  );
}

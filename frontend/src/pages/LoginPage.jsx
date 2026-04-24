import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, formatApiError } from "../lib/auth";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Bem-vindo de volta!");
      navigate("/");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
         style={{ background: "radial-gradient(ellipse at top, #1E1B4B 0%, #020617 70%)" }}>
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: "url(https://images.unsplash.com/photo-1622969309378-d8f04f392fb0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwyfHxteXN0aWNhbCUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzc3MDM4ODg0fDA&ixlib=rb-4.1.0&q=85)",
        backgroundSize: "cover", backgroundPosition: "center"
      }} />

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

        <h2 className="text-3xl font-bold mb-1" style={{ fontFamily: "Outfit" }}>Entrar</h2>
        <p className="text-slate-400 text-sm mb-6">Acesse sua coleção e gerencie seus decks.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Email</label>
            <input
              type="email"
              data-testid="login-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              placeholder="voce@exemplo.com"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Senha</label>
            <input
              type="password"
              data-testid="login-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            data-testid="login-submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-6 py-3 font-medium transition-colors border border-indigo-500 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          Não tem conta?{" "}
          <Link to="/register" data-testid="link-register" className="text-indigo-400 hover:text-indigo-300 font-medium">Cadastre-se</Link>
        </div>
      </div>
    </div>
  );
}

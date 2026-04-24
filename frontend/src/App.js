import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import CardLibraryPage from "./pages/CardLibraryPage";
import CardBuilderPage from "./pages/CardBuilderPage";
import DeckListPage from "./pages/DeckListPage";
import DeckBuilderPage from "./pages/DeckBuilderPage";
import { Loader2 } from "lucide-react";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <Loader2 className="animate-spin text-indigo-400" size={24} />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
            <Route path="/" element={<Protected><DashboardPage /></Protected>} />
            <Route path="/cards" element={<Protected><CardLibraryPage /></Protected>} />
            <Route path="/cards/new" element={<Protected><CardBuilderPage /></Protected>} />
            <Route path="/cards/:id/edit" element={<Protected><CardBuilderPage /></Protected>} />
            <Route path="/decks" element={<Protected><DeckListPage /></Protected>} />
            <Route path="/decks/:id" element={<Protected><DeckBuilderPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  Sparkles,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Harap lengkapi semua kolom.');
      return;
    }

    setIsLoading(true);
    try {
      const success = await login(email, password);
      if (success) {
        navigate('/');
      } else {
        setError('Email atau password salah. Coba: admin@paud.sch.id / admin123');
      }
    } catch (err) {
      setError('Terjadi kesalahan sistem. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-900 overflow-hidden font-sans">

      {/* BACKGROUND GRAPHICS / BLUR MESHES */}
      <div className="absolute -left-20 -top-20 w-96 h-96 rounded-full bg-brand-600/30 blur-[120px] animate-pulse-slow"></div>
      <div className="absolute -right-20 -bottom-20 w-96 h-96 rounded-full bg-indigo-600/30 blur-[120px] animate-pulse-slow"></div>

      <div className="absolute top-1/4 right-1/4 w-72 h-72 rounded-full bg-purple-500/10 blur-[80px] animate-float"></div>

      {/* Floating Sparkles in Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
        <Sparkles className="absolute top-10 left-10 text-white h-6 w-6 animate-spin-slow" />
        <Sparkles className="absolute bottom-20 right-10 text-white h-4 w-4 animate-float" />
        <Sparkles className="absolute top-1/3 right-20 text-white h-5 w-5 animate-pulse" />
      </div>

      {/* CARD CONTAINER */}
      <div className="relative z-10 w-full max-w-md px-6">

        {/* Branding header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3.5 rounded-2xl bg-gradient-to-tr from-brand-500 to-indigo-600 text-white shadow-xl shadow-brand-500/20 mb-4 animate-float">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight leading-none">PAUD Billing System</h2>
          <p className="text-xs text-indigo-200 mt-2 font-medium">Sistem Pencatatan Tagihan & Keuangan PAUD</p>
        </div>

        {/* Form Card */}
        <div className="glass bg-white/5 dark:bg-slate-950/40 backdrop-blur-xl border border-white/10 dark:border-slate-800/60 p-8 rounded-3xl shadow-2xl relative overflow-hidden">

          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-500 to-indigo-600"></div>

          <h3 className="text-xl font-bold text-white mb-2">Masuk Administrator</h3>
          <p className="text-xs text-slate-400 mb-6">Silakan masuk menggunakan akun admin Anda</p>

          {/* Validation Errors */}
          {error && (
            <div className="mb-6 flex gap-2.5 p-3.5 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs font-semibold leading-relaxed animate-fade-in">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Email Sekolah</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <Mail className="h-4.5 w-4.5" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@paud.sch.id"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <Lock className="h-4.5 w-4.5" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Login Trigger Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-6 bg-gradient-to-r from-brand-600 to-indigo-600 text-white py-3.5 px-4 rounded-xl text-sm font-bold shadow-lg shadow-brand-600/20 hover:from-brand-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Menghubungkan...
                </>
              ) : (
                <>
                  Masuk Sekarang <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Seed accounts disclaimer */}
          <div className="mt-6 pt-6 border-t border-white/5 text-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Akun Uji Coba Default</span>
            <code className="text-[10px] text-brand-400 bg-brand-950/40 px-2 py-0.5 rounded mt-1.5 inline-block">
              admin@paud.sch.id / admin123
            </code>
          </div>

        </div>

        {/* Footer legalities */}
        <p className="text-center text-[10px] text-slate-500 mt-8 font-medium">
          © {new Date().getFullYear()} PAUD Melati Indah. All rights reserved.
        </p>

      </div>
    </div>
  );
}

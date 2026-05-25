import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Lock, MessageSquare, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginSms } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState('password'); // 'password' | 'sms'
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sentCode, setSentCode] = useState('');
  const [loading, setLoading] = useState(false);

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);

  const handleSendCode = async () => {
    if (!isPhoneValid || sending || countdown > 0) return;
    setSending(true);
    try {
      const res = await fetch('/api/auth/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message || '验证码已发送');
      if (data.code) setSentCode(data.code);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(timer); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isPhoneValid) { toast.error('请输入有效的手机号'); return; }
    setLoading(true);
    try {
      let user;
      if (mode === 'password') {
        if (!password) { toast.error('请输入密码'); return; }
        user = await login(phone, password);
      } else {
        if (!code) { toast.error('请输入验证码'); return; }
        user = await loginSms(phone, code);
      }
      toast.success(`欢迎回来，${user.name}`);
      navigate(user.role === 'mentor' ? '/' : '/agile/dashboard', { replace: true });
    } catch (e) {
      toast.error(e.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
            <GraduationCap size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">导师工作台</h1>
          <p className="text-xs text-slate-400 mt-1">统一科研项目管理平台</p>
        </div>

        <div className="card p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl bg-slate-50">
            <button onClick={() => setMode('password')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'password' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              密码登录
            </button>
            <button onClick={() => setMode('sms')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'sms' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              验证码登录
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Phone */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">手机号</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="请输入手机号" maxLength={11}
                  className="input pl-10 py-2.5 text-sm" />
              </div>
            </div>

            {/* Password */}
            {mode === 'password' && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="请输入密码" className="input pl-10 pr-10 py-2.5 text-sm" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* SMS Code */}
            {mode === 'sms' && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">验证码</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input type="text" value={code} onChange={e => setCode(e.target.value)}
                      placeholder="6位验证码" maxLength={6}
                      className="input pl-10 py-2.5 text-sm" />
                  </div>
                  <button type="button" onClick={handleSendCode} disabled={!isPhoneValid || countdown > 0}
                    className={`px-4 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                      isPhoneValid && countdown === 0
                        ? 'text-white'
                        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    }`}
                    style={isPhoneValid && countdown === 0 ? { background: 'var(--accent)' } : {}}>
                    {countdown > 0 ? `${countdown}s` : '获取验证码'}
                  </button>
                </div>
                {sentCode && (
                  <p className="text-[11px] text-amber-600 mt-1.5">开发模式，验证码：<span className="font-mono font-bold">{sentCode}</span></p>
                )}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn w-full py-2.5 text-sm font-medium text-white rounded-xl transition-all"
              style={{ background: 'var(--accent)' }}>
              {loading ? '登录中...' : '登 录'}
            </button>
          </form>

          <div className="mt-5 text-center text-xs text-slate-400">
            还没有账号？
            <Link to="/register" className="font-medium hover:underline ml-1" style={{ color: 'var(--accent)' }}>立即注册</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

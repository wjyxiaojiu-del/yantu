import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Lock, MessageSquare, Eye, EyeOff, GraduationCap, User, Mail, Briefcase, BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
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
        body: JSON.stringify({ phone, purpose: 'register' }),
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
    if (!code) { toast.error('请输入验证码'); return; }
    if (password.length < 6) { toast.error('密码至少 6 位'); return; }
    if (password !== confirmPassword) { toast.error('两次密码不一致'); return; }
    if (!name.trim()) { toast.error('请输入姓名'); return; }
    setLoading(true);
    try {
      const user = await register({ phone, code, password, name, role, email: email || undefined });
      toast.success(`注册成功，欢迎 ${user.name}`);
      navigate(user.role === 'mentor' ? '/' : '/agile/dashboard', { replace: true });
    } catch (e) {
      toast.error(e.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-page)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
            <GraduationCap size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">注册账号</h1>
          <p className="text-xs text-slate-400 mt-1">创建您的导师工作台账户</p>
        </div>

        <div className="card p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Phone */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">手机号 *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="请输入手机号" maxLength={11}
                  className="input pl-10 py-2.5 text-sm" />
              </div>
            </div>

            {/* Code */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">验证码 *</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input type="text" value={code} onChange={e => setCode(e.target.value)}
                    placeholder="6位验证码" maxLength={6}
                    className="input pl-10 py-2.5 text-sm" />
                </div>
                <button type="button" onClick={handleSendCode} disabled={!isPhoneValid || countdown > 0}
                  className={`px-4 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    isPhoneValid && countdown === 0 ? 'text-white' : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                  }`}
                  style={isPhoneValid && countdown === 0 ? { background: 'var(--accent)' } : {}}>
                  {countdown > 0 ? `${countdown}s` : '获取验证码'}
                </button>
              </div>
              {sentCode && (
                <p className="text-[11px] text-amber-600 mt-1.5">开发模式，验证码：<span className="font-mono font-bold">{sentCode}</span></p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">密码 *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="至少 6 位" className="input pl-10 pr-10 py-2.5 text-sm" />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">确认密码 *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type={showPwd ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码" className="input pl-10 py-2.5 text-sm" />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">姓名 *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="您的真实姓名" className="input pl-10 py-2.5 text-sm" />
              </div>
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">角色 *</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRole('mentor')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                    role === 'mentor'
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-50)]'
                      : 'border-slate-100 text-slate-400 hover:border-slate-200'
                  }`}>
                  <Briefcase size={14} /> 导师
                </button>
                <button type="button" onClick={() => setRole('student')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                    role === 'student'
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-50)]'
                      : 'border-slate-100 text-slate-400 hover:border-slate-200'
                  }`}>
                  <BookOpen size={14} /> 学生
                </button>
              </div>
            </div>

            {/* Email (optional) */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">邮箱（选填）</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="用于找回密码" className="input pl-10 py-2.5 text-sm" />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="btn w-full py-2.5 text-sm font-medium text-white rounded-xl transition-all"
              style={{ background: 'var(--accent)' }}>
              {loading ? '注册中...' : '注 册'}
            </button>
          </form>

          <div className="mt-5 text-center text-xs text-slate-400">
            已有账号？
            <Link to="/login" className="font-medium hover:underline ml-1" style={{ color: 'var(--accent)' }}>去登录</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

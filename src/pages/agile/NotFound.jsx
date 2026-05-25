import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function NotFound() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-6 animate-fadeIn">
      <div className="relative">
        <div className="text-[120px] font-black select-none leading-none" style={{ color: c.accent50 }}>404</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl animate-bounceIn"
            style={{
              background: `linear-gradient(135deg, ${c.accent}, ${c.accentLight})`,
              boxShadow: `0 8px 30px ${c.accent100}`,
            }}>
            <span className="text-3xl font-bold text-white">?</span>
          </div>
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-2">页面不存在</h2>
        <p className="text-sm text-slate-400">你要找的页面可能已被移除或路径有误</p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn btn-secondary gap-2">
          <ArrowLeft size={16} /> 返回上页
        </button>
        <button onClick={() => navigate('/')} className="btn btn-primary gap-2">
          <Home size={16} /> 回到控制台
        </button>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, FileText, ListTodo, BarChart3, BookOpen, Loader2, User, Bot, Copy, Check, Trash2, Zap, Flame } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import api from '../../api';

const QUICK_ACTIONS = [
  { id: 'standup', icon: FileText, label: '生成站会纪要', color: '#6366f1' },
  { id: 'breakdown', icon: ListTodo, label: '任务拆解', color: 'var(--accent)' },
  { id: 'analyze', icon: BarChart3, label: '项目分析', color: '#10b981' },
  { id: 'literature', icon: BookOpen, label: '文献问答', color: '#8b5cf6' },
];

export default function AIAssistant() {
  const { projectId } = useProject();
  const { theme } = useTheme();
  const c = theme.colors;
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [paperContent, setPaperContent] = useState('');
  const [cacheStats, setCacheStats] = useState(null);
  const [warming, setWarming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetchCacheStats();
    // Auto-refresh stats every 10 seconds
    const interval = setInterval(fetchCacheStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchCacheStats = async () => {
    try {
      const res = await fetch('/api/ai/stats').then(r => r.json());
      setCacheStats(res);
    } catch (e) {
      console.error('Failed to fetch cache stats:', e);
    }
  };

  const handleWarmup = async () => {
    setWarming(true);
    try {
      const res = await fetch('/api/ai/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }).then(r => r.json());

      toast.success(`预热完成！新增 ${res.warmed} 条缓存`);
      fetchCacheStats();
    } catch (e) {
      toast.error('预热失败：' + e.message);
    } finally {
      setWarming(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input.trim(), id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      let res;
      if (activeAction === 'standup') {
        res = await fetch('/api/ai/standup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, completedTasks: input.trim() }),
        }).then(r => r.json());
      } else if (activeAction === 'breakdown') {
        res = await fetch('/api/ai/breakdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: input.trim(), projectId }),
        }).then(r => r.json());
      } else if (activeAction === 'analyze') {
        res = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        }).then(r => r.json());
      } else if (activeAction === 'literature') {
        res = await fetch('/api/ai/literature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: input.trim(), paperContent, projectId }),
        }).then(r => r.json());
      } else {
        res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
            projectId,
          }),
        }).then(r => r.json());
      }

      if (res.error) throw new Error(res.error);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.content,
        id: Date.now() + 1,
        fromCache: res.fromCache || false,
      }]);
      setActiveAction(null);
      fetchCacheStats(); // Update cache stats after each request
    } catch (e) {
      toast.error('AI 响应失败：' + e.message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `抱歉，请求出错了：${e.message}`,
        id: Date.now() + 1,
        error: true,
      }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleQuickAction = (action) => {
    setActiveAction(action.id);
    const prompts = {
      standup: '请帮我生成今天的站会纪要',
      breakdown: '请帮我拆解这个任务：',
      analyze: '请分析当前项目的整体进度和风险',
      literature: '请帮我分析这篇文献',
    };
    setInput(prompts[action.id]);
    inputRef.current?.focus();
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('已复制到剪贴板');
  };

  const handleClear = () => {
    setMessages([]);
    setActiveAction(null);
    toast.success('对话已清空');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles size={24} className="text-orange-500" />
            AI 助手
          </h1>
          <p className="text-sm text-slate-400 mt-1">智能问答、任务拆解、文献分析</p>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} className="btn btn-secondary gap-1.5 text-xs">
            <Trash2 size={14} /> 清空对话
          </button>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col card overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-50), var(--accent-100))',
                    boxShadow: '0 4px 20px var(--accent-100)',
                  }}>
                  <Sparkles size={36} className="text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">研途启航 AI 助手</h3>
                <p className="text-sm text-slate-400 max-w-md">
                  我可以帮你生成站会纪要、拆解任务、分析项目进度、回答学术问题
                </p>
                <div className="flex gap-2 mt-6">
                  {QUICK_ACTIONS.map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 hover:scale-105"
                      style={{
                        background: `${action.color}08`,
                        color: action.color,
                        border: `1px solid ${action.color}15`,
                      }}>
                      <action.icon size={14} />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                style={{ animation: 'slideUp .3s var(--spring-bounce)' }}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
                      boxShadow: '0 2px 8px var(--accent-200)',
                    }}>
                    <Bot size={16} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-orange-500 text-white'
                    : msg.error ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-50 text-slate-700'
                }`}
                  style={{
                    boxShadow: msg.role === 'user'
                      ? '0 2px 12px var(--accent-200)'
                      : '0 2px 12px rgba(0,0,0,0.04)',
                  }}>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  {msg.role === 'assistant' && !msg.error && (
                    <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                      <button
                        onClick={() => handleCopy(msg.content, msg.id)}
                        className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all duration-200">
                        {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                      {msg.fromCache && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <Zap size={10} /> 缓存命中
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      boxShadow: '0 2px 8px rgba(99,102,241,0.2)',
                    }}>
                    <User size={16} className="text-white" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3" style={{ animation: 'slideUp .3s var(--spring-bounce)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
                    boxShadow: '0 2px 8px var(--accent-200)',
                  }}>
                  <Bot size={16} className="text-white" />
                </div>
                <div className="bg-slate-50 rounded-2xl px-4 py-3" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    思考中...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Active Action Banner */}
          {activeAction && (
            <div className="px-5 py-2 border-t" style={{ background: 'var(--accent-50)', borderColor: 'rgba(241,245,249,0.6)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-orange-600">
                  模式：{QUICK_ACTIONS.find(a => a.id === activeAction)?.label}
                </span>
                <button onClick={() => setActiveAction(null)} className="text-xs text-slate-400 hover:text-slate-600">
                  切换到自由对话
                </button>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t" style={{ borderColor: 'rgba(241,245,249,0.6)' }}>
            {activeAction === 'literature' && (
              <div className="mb-3">
                <textarea
                  value={paperContent}
                  onChange={e => setPaperContent(e.target.value)}
                  className="input text-xs"
                  rows={3}
                  placeholder="粘贴文献内容（可选）..."
                />
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                className="flex-1 input"
                placeholder={activeAction === 'breakdown' ? '输入要拆解的任务名称...' : '输入消息...'}
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="btn btn-primary px-4"
                style={{ boxShadow: '0 2px 8px var(--accent-200)' }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions Sidebar */}
        <div className="w-[280px] flex-shrink-0 space-y-3" style={{ animation: 'slideUp .5s var(--spring-bounce) .1s both' }}>
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Sparkles size={14} className="text-orange-500" />
              快捷功能
            </h3>
            <div className="space-y-2">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-300 hover:scale-[1.02] ${
                    activeAction === action.id ? 'ring-1' : ''
                  }`}
                  style={{
                    background: activeAction === action.id ? `${action.color}10` : 'rgba(241,245,249,0.3)',
                    borderColor: activeAction === action.id ? action.color : 'transparent',
                  }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `${action.color}15` }}>
                    <action.icon size={18} style={{ color: action.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-700">{action.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {action.id === 'standup' && '根据任务自动生成'}
                      {action.id === 'breakdown' && '将大任务拆成小步骤'}
                      {action.id === 'analyze' && '全面评估项目状态'}
                      {action.id === 'literature' && '解读论文内容'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">使用提示</h3>
            <div className="space-y-2 text-xs text-slate-500 leading-relaxed">
              <p>直接输入问题即可与 AI 对话</p>
              <p>选择快捷功能可获得更精准的回答</p>
              <p>AI 已加载当前项目数据，可直接询问进度相关问题</p>
            </div>
          </div>

          {cacheStats && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Zap size={14} className="text-emerald-500" />
                缓存统计
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">命中率</span>
                  <span className="font-medium text-emerald-600">{cacheStats.hitRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">缓存条目</span>
                  <span className="font-medium text-slate-700">{cacheStats.cacheSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">总请求</span>
                  <span className="font-medium text-slate-700">{cacheStats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">命中/未命中</span>
                  <span className="font-medium text-slate-700">{cacheStats.hits}/{cacheStats.misses}</span>
                </div>
              </div>
              <button
                onClick={handleWarmup}
                disabled={warming}
                className="w-full mt-3 btn btn-secondary text-xs gap-1.5"
              >
                {warming ? (
                  <><Loader2 size={12} className="animate-spin" /> 预热中...</>
                ) : (
                  <><Flame size={12} /> 预热缓存</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

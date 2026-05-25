import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Loader2, Bot, User, Minimize2, Copy, Check } from 'lucide-react';

export default function AIFloatingBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim(), id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          projectId: 1,
        }),
      }).then(r => r.json());

      if (res.error) throw new Error(res.error);
      setMessages(prev => [...prev, { role: 'assistant', content: res.content, id: Date.now() + 1, fromCache: res.fromCache }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `请求出错：${e.message}`, id: Date.now() + 1, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
            boxShadow: '0 4px 20px var(--accent-300), 0 0 40px var(--accent-100)',
            animation: 'slideUp .5s var(--spring-bounce)',
          }}>
          <Sparkles size={22} />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-[100] w-[380px] h-[520px] flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(40px) saturate(200%)',
            border: '1px solid rgba(255,255,255,0.8)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.5)',
            animation: 'slideUp .3s var(--spring-bounce)',
          }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b"
            style={{ background: 'linear-gradient(135deg, var(--accent-50), var(--accent-100))', borderColor: 'rgba(241,245,249,0.6)' }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' }}>
                <Sparkles size={14} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-700">AI 助手</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setMessages([]); }}
                className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-all text-xs">
                清空
              </button>
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-all">
                <Minimize2 size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--accent-50)' }}>
                  <Sparkles size={24} style={{ color: 'var(--accent)' }} />
                </div>
                <p className="text-sm font-medium text-slate-600 mb-1">有什么可以帮你的？</p>
                <p className="text-xs text-slate-400">随时提问，AI 已加载项目数据</p>
                <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                  {['分析项目进度', '今天做什么', '帮我拆解任务'].map(q => (
                    <button key={q} onClick={() => { setInput(q); }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/60 text-slate-500 hover:bg-white border border-slate-100 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                style={{ animation: 'slideUp .2s var(--spring-bounce)' }}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-1"
                    style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' }}>
                    <Bot size={12} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'text-white'
                    : msg.error ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-50 text-slate-700'
                }`}
                  style={{
                    background: msg.role === 'user' ? 'linear-gradient(135deg, var(--accent), var(--accent-light))' : undefined,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  }}>
                  <div className="whitespace-pre-wrap leading-relaxed text-[13px]">{msg.content}</div>
                  {msg.role === 'assistant' && !msg.error && (
                    <div className="flex items-center gap-1.5 mt-1.5 pt-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                      <button onClick={() => handleCopy(msg.content, msg.id)}
                        className="p-0.5 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-all">
                        {copiedId === msg.id ? <Check size={10} /> : <Copy size={10} />}
                      </button>
                      {msg.fromCache && <span className="text-[9px] text-emerald-500">缓存</span>}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-1"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    <User size={12} className="text-white" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' }}>
                  <Bot size={12} className="text-white" />
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 size={12} className="animate-spin" /> 思考中...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t" style={{ borderColor: 'rgba(241,245,249,0.6)' }}>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                className="flex-1 input text-sm py-2"
                placeholder="输入消息..."
                disabled={loading}
              />
              <button onClick={handleSend} disabled={!input.trim() || loading}
                className="px-3 py-2 rounded-xl text-white text-sm transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' }}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle2, Circle, BarChart3, Award, Sparkles, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { SkeletonCard } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';

export default function Report() {
  const { projectId } = useProject();
  const { theme } = useTheme();
  const c = theme.colors;
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [stories, setStories] = useState([]);
  const [risks, setRisks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [deliverables, setDeliverables] = useState(() => {
    try {
      const saved = localStorage.getItem('deliverables');
      return saved ? JSON.parse(saved) : [
        { id: 1, name: '入学材料清单', checked: false },
        { id: 2, name: '导师沟通纪要', checked: false },
        { id: 3, name: '研究方向规划文档', checked: false },
        { id: 4, name: '读书笔记 ×3', checked: false },
        { id: 5, name: '文献管理库（Zotero）', checked: false },
        { id: 6, name: '知识库系统（Obsidian）', checked: false },
        { id: 7, name: '学术写作模板', checked: false },
        { id: 8, name: '项目复盘报告', checked: false },
      ];
    } catch {
      return [
        { id: 1, name: '入学材料清单', checked: false },
        { id: 2, name: '导师沟通纪要', checked: false },
        { id: 3, name: '研究方向规划文档', checked: false },
        { id: 4, name: '读书笔记 ×3', checked: false },
        { id: 5, name: '文献管理库（Zotero）', checked: false },
        { id: 6, name: '知识库系统（Obsidian）', checked: false },
        { id: 7, name: '学术写作模板', checked: false },
        { id: 8, name: '项目复盘报告', checked: false },
      ];
    }
  });

  const load = async () => {
    try {
      const [d, s, st, r] = await Promise.all([
        api.getProjectStats(projectId),
        api.getSprints({ project_id: projectId }),
        api.getStories({ project_id: projectId }),
        api.getRisks({ project_id: projectId }),
      ]);
      setStats(d);
      setMilestones(d.milestones || []);
      setSprints(s);
      setStories(st);
      setRisks(r);
      setError(null);
    } catch (e) {
      setError(e.message);
      toast.error('加载报告数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const toggleDeliverable = (id) => {
    setDeliverables(prev => {
      const next = prev.map(d => d.id === id ? { ...d, checked: !d.checked } : d);
      try { localStorage.setItem('deliverables', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleExport = () => {
    const text = generateReport(stats, sprints, stories, risks, milestones, deliverables);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '项目复盘报告.txt'; a.click();
    URL.revokeObjectURL(url);
    toast.success('报告已导出');
  };

  const handleExportMarkdown = () => {
    window.open(`/api/export/markdown?project_id=${projectId}`, '_blank');
    toast.success('Markdown 报告已导出');
  };

  const handleAISummary = async () => {
    setAiLoading(true);
    try {
      const prompt = `请用200字以内生成一份项目汇报摘要，适合向导师汇报：\n项目总工作量：${stats.totalPoints}，已完成：${stats.completedPoints}\n故事完成率：${stats.storyCompletionRate}%\n任务完成率：${stats.totalTasks ? Math.round(stats.doneTasks / stats.totalTasks * 100) : 0}%\n里程碑：${milestones.map(m => `${m.name}(${m.status === 'completed' ? '已达成' : '待达成'})`).join('、')}\n风险：${risks.length}个`;
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }).then(r => r.json());
      setAiSummary(res.content || '生成失败');
    } catch (e) {
      toast.error('AI 摘要生成失败：' + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="h-8 w-32 bg-slate-200/50 rounded-lg animate-pulse" />
      <div className="grid grid-cols-4 gap-4">{Array.from({length:4}).map((_,i)=><SkeletonCard key={i} />)}</div>
    </div>
  );

  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  const doneDeliverables = deliverables.filter(d => d.checked).length;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">项目报告</h1>
          <p className="text-sm text-slate-400 mt-1">自动生成的项目概况与复盘数据</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAISummary} disabled={aiLoading} className="btn btn-secondary gap-1.5">
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI 摘要
          </button>
          <button onClick={handleExport} className="btn btn-secondary">
            <Download size={16} /> 导出 TXT
          </button>
          <button onClick={handleExportMarkdown} className="btn btn-primary">
            <Download size={16} /> 导出 Markdown
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '总工作量', value: stats.totalPoints, sub: `已完成 ${stats.completedPoints}`, gradient: 'linear-gradient(135deg, var(--accent-50), var(--accent-100))' },
          { label: '事件完成率', value: `${stats.storyCompletionRate}%`, sub: `${stats.completedStories}/${stats.totalStories} 个`, gradient: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.12))' },
          { label: '任务完成率', value: `${stats.totalTasks ? Math.round(stats.doneTasks / stats.totalTasks * 100) : 0}%`, sub: `${stats.doneTasks}/${stats.totalTasks} 个`, gradient: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.12))' },
          { label: '交付物进度', value: `${doneDeliverables}/${deliverables.length}`, sub: `已勾选 ${doneDeliverables} 项`, gradient: 'linear-gradient(135deg, rgba(244,63,94,0.06), rgba(244,63,94,0.12))' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ animation: `slideUp .5s var(--spring-bounce) ${i * 0.08}s both` }}>
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{s.label}</span>
            <div className="text-2xl font-bold text-slate-900 mt-1 animate-countUp">{s.value}</div>
            <span className="text-xs text-slate-400">{s.sub}</span>
          </div>
        ))}
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div className="card p-5" style={{ animation: 'slideUp .4s var(--spring-bounce)', borderLeft: '3px solid var(--accent)' }}>
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Sparkles size={14} style={{ color: 'var(--accent)' }} /> AI 汇报摘要
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Sprint Summary */}
        <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .15s both' }}>
          <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><BarChart3 size={15} className="text-orange-500" /> 迭代完成情况</h3>
          <div className="space-y-4">
            {sprints.map((s, i) => {
              const ss = stories.filter(st => st.sprint_id === s.id);
              const done = ss.filter(st => st.status === 'done').length;
              const total = ss.length;
              const pct = total ? Math.round(done / total * 100) : 0;
              return (
                <div key={s.id} style={{ animation: `slideInRight .35s var(--spring-bounce) ${i * 80}ms both` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700">S{s.number}：{s.name.replace(/Sprint \d+：/, '')}</span>
                    <span className="text-xs text-slate-400">{done}/{total} ({pct}%)</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(241,245,249,0.6)' }}>
                    <div className="h-full rounded-full relative overflow-hidden"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${c.accent}, #8b5cf6, #a855f7)`,
                        boxShadow: `0 0 10px ${c.accent100}`,
                        transition: 'width 1s cubic-bezier(0.22, 1, 0.36, 1)',
                      }}>
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation: 'shimmerBar 2s infinite' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Milestones */}
        <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .2s both' }}>
          <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><Award size={15} className="text-amber-500" /> 里程碑达成</h3>
          <div className="space-y-2.5">
            {milestones.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-orange-50/20 transition-all duration-300 group"
                style={{ animation: `slideInRight .35s var(--spring-bounce) ${i * 80}ms both` }}>
                {m.status === 'completed' ? <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 group-hover:scale-110 transition-transform duration-300" /> : <Circle size={18} className="text-slate-300 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">{m.name}</div>
                  <div className="text-[11px] text-slate-400">{m.due_date}</div>
                </div>
                <span className={`badge text-[10px] ${m.status === 'completed' ? 'bg-emerald-50/60 text-emerald-600 ring-1 ring-emerald-100/40' : 'bg-slate-100/60 text-slate-400 ring-1 ring-slate-200/40'}`}>
                  {m.status === 'completed' ? '已达成' : '待达成'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deliverables */}
      <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .25s both' }}>
        <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><FileText size={15} className="text-orange-500" /> 交付物清单</h3>
        <div className="grid grid-cols-2 gap-2">
          {deliverables.map((d, i) => (
            <button key={d.id} onClick={() => toggleDeliverable(d.id)}
              className="flex items-center gap-3 p-3.5 rounded-xl text-left transition-all duration-400"
              style={{
                background: d.checked ? 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.1))' : 'rgba(241,245,249,0.3)',
                border: `1px solid ${d.checked ? 'rgba(16,185,129,0.2)' : 'transparent'}`,
                transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                animation: `slideUp .3s var(--spring-bounce) ${i * 40}ms both`,
              }}
              onMouseEnter={e => { if (!d.checked) e.currentTarget.style.background = 'rgba(241,245,249,0.5)'; }}
              onMouseLeave={e => { if (!d.checked) e.currentTarget.style.background = 'rgba(241,245,249,0.3)'; }}>
              <CheckCircle2 size={18} className="transition-all duration-500 flex-shrink-0"
                style={{ color: d.checked ? '#10b981' : '#cbd5e1', transform: d.checked ? 'scale(1.1)' : 'scale(1)' }} />
              <span className="text-sm transition-colors duration-300" style={{ color: d.checked ? '#059669' : '#475569', fontWeight: d.checked ? 600 : 400, textDecoration: d.checked ? 'line-through' : 'none' }}>{d.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Risk Summary */}
      <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .3s both' }}>
        <h3 className="text-sm font-semibold text-slate-800 mb-4">风险概况</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { level: 'high', label: '高风险', gradient: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.12))', text: 'text-red-600', glow: 'rgba(239,68,68,0.1)' },
            { level: 'medium', label: '中风险', gradient: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.12))', text: 'text-amber-600', glow: 'rgba(245,158,11,0.1)' },
            { level: 'low', label: '低风险', gradient: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.12))', text: 'text-emerald-600', glow: 'rgba(16,185,129,0.1)' },
          ].map(({ level, label, gradient, text, glow }, i) => {
            const count = risks.filter(r => r.level === level).length;
            return (
              <div key={level} className="relative overflow-hidden rounded-xl p-5 text-center transition-all duration-500 group"
                style={{ background: gradient, animation: `scaleIn .4s var(--spring-bounce) ${0.3 + i * 0.05}s both` }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = `0 8px 24px ${glow}`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div className={`text-3xl font-bold ${text} animate-countUp`}>{count}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function generateReport(stats, sprints, stories, risks, milestones, deliverables) {
  let r = '';
  r += '═══════════════════════════════════════\n';
  r += '  「研途启航」项目复盘报告\n';
  r += '  生成时间：' + new Date().toLocaleString('zh-CN') + '\n';
  r += '═══════════════════════════════════════\n\n';
  r += '【一、项目概况】\n';
  r += `项目名称：研途启航 - 2026级研究生入学准备全流程管理项目\n`;
  r += `项目周期：8周（2026.06.01 - 2026.07.26）\n`;
  r += `总工作量：${stats.totalPoints} | 已完成：${stats.completedPoints}\n`;
  r += `事件完成率：${stats.storyCompletionRate}%\n`;
  r += `任务完成率：${stats.totalTasks ? Math.round(stats.doneTasks / stats.totalTasks * 100) : 0}%\n\n`;
  r += '【二、迭代完成情况】\n';
  sprints.forEach(s => { const ss = stories.filter(st => st.sprint_id === s.id); const done = ss.filter(st => st.status === 'done').length; r += `S${s.number} ${s.name}：${done}/${ss.length}\n`; });
  r += '\n【三、里程碑达成】\n';
  milestones.forEach(m => { r += `${m.name}（${m.due_date}）：${m.status === 'completed' ? '已达成' : '未达成'}\n`; });
  r += '\n【四、交付物清单】\n';
  deliverables.forEach(d => { r += `${d.checked ? '[x]' : '[ ]'} ${d.name}\n`; });
  r += '\n【五、风险概况】\n';
  risks.forEach(risk => { r += `- ${risk.title} [${risk.level}] ${risk.status}\n`; });
  r += '\n═══════════════════════════════════════\n  报告结束\n═══════════════════════════════════════\n';
  return r;
}

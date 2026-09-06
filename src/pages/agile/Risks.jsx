import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Archive, Check, ChevronRight, Clock3, Edit2, Loader2, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { SkeletonTable } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import Modal from '../../components/Modal';
import api from '../../api';

const PRIORITIES = [
  { id: 'S', name: '立即处理', meaning: '很紧急 · 很重要', note: '今天不处理就会明显影响推进', tone: 'red' },
  { id: 'A', name: '优先推进', meaning: '紧急 · 重要', note: '尽快安排明确动作', tone: 'orange' },
  { id: 'B', name: '持续投入', meaning: '不紧急 · 但重要', note: '最容易被忽略，也最值得保护时间', tone: 'blue' },
  { id: 'C', name: '排队处理', meaning: '不紧急 · 不重要 · 但要做', note: '有空档时集中清理', tone: 'slate' },
];

const LONG_TERM = { id: 'L', name: '长期关注', meaning: 'Long-term', note: '不抢占今天，但需要定期回看', tone: 'violet' };
const LEGACY_PRIORITY = { high: 'S', medium: 'B', low: 'C' };

function priorityOf(risk) {
  return ['S', 'A', 'B', 'C', 'L'].includes(risk.priority) ? risk.priority : (LEGACY_PRIORITY[risk.level] || 'B');
}

export default function Risks() {
  const { projectId } = useProject();
  const toast = useToast();
  const [risks, setRisks] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = async () => {
    try {
      const result = await api.getRisks({ project_id: projectId });
      setRisks((Array.isArray(result) ? result : []).map((risk) => ({ ...risk, priority: priorityOf(risk) })));
      setError(null);
    } catch (e) {
      setError(e.message);
      toast.error('加载关注事项失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const visibleRisks = useMemo(() => risks.filter((risk) => showClosed || risk.status !== 'closed'), [risks, showClosed]);

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') {
        const created = await api.createRisk({ ...data, project_id: projectId });
        setRisks((current) => [{ ...created, priority: priorityOf(created) }, ...current]);
        toast.success('已加入优先级队列');
      } else {
        const updated = await api.updateRisk(modal.risk.id, data);
        setRisks((current) => current.map((risk) => risk.id === updated.id ? { ...risk, ...updated, priority: priorityOf(updated) } : risk));
        toast.success('事项已更新');
      }
      setModal(null);
    } catch (e) {
      toast.error(`保存失败：${e.message}`);
    }
  };

  const updateRisk = async (risk, patch, message) => {
    const previous = risk;
    setRisks((current) => current.map((item) => item.id === risk.id ? { ...item, ...patch } : item));
    try {
      const updated = await api.updateRisk(risk.id, patch);
      setRisks((current) => current.map((item) => item.id === risk.id ? { ...item, ...updated, priority: priorityOf(updated) } : item));
      if (message) toast.success(message);
    } catch (e) {
      setRisks((current) => current.map((item) => item.id === risk.id ? previous : item));
      toast.error('更新失败');
    }
  };

  const handleDelete = async (risk) => {
    if (!confirm(`确定删除「${risk.title}」？`)) return;
    try {
      await api.deleteRisk(risk.id);
      setRisks((current) => current.filter((item) => item.id !== risk.id));
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败');
    }
  };

  if (loading) return <SkeletonTable rows={5} cols={5} />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  const activeCount = risks.filter((risk) => risk.status !== 'closed').length;
  const criticalCount = risks.filter((risk) => risk.status !== 'closed' && priorityOf(risk) === 'S').length;
  const longTerm = visibleRisks.filter((risk) => priorityOf(risk) === 'L');

  return (
    <div className="priority-control-shell max-w-[1480px] mx-auto space-y-5">
      <header className="priority-control-header workbench-reveal">
        <div>
          <div className="priority-eyebrow"><ShieldCheck size={13} /> PERSONAL PRIORITY CONTROL</div>
          <h1>风险与关注事项</h1>
          <p>不做复杂打分，由你决定什么值得先处理。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`priority-closed-toggle ${showClosed ? 'is-active' : ''}`} onClick={() => setShowClosed((value) => !value)}><Archive size={14} /> {showClosed ? '隐藏已关闭' : '查看已关闭'}</button>
          <button onClick={() => setModal({ mode: 'create', priority: 'B' })} className="btn btn-primary"><Plus size={16} /> 新增关注事项</button>
        </div>
      </header>

      <section className="priority-summary workbench-reveal workbench-reveal-delay-1">
        <div><span>当前关注</span><strong>{activeCount}</strong><small>项仍在队列中</small></div>
        <div className={criticalCount ? 'is-critical' : ''}><span>S 级事项</span><strong>{criticalCount}</strong><small>{criticalCount ? '需要优先看一眼' : '目前没有燃眉之急'}</small></div>
        <div><span>长期关注</span><strong>{risks.filter((risk) => priorityOf(risk) === 'L' && risk.status !== 'closed').length}</strong><small>独立于今日排序</small></div>
        <div className="priority-principle"><Sparkles size={15} /><p><b>排序原则</b><span>先问“现在不做会怎样”，再问“长期是否重要”。</span></p></div>
      </section>

      <div className="priority-control-layout workbench-reveal workbench-reveal-delay-2">
        <main className="priority-stack">
          {PRIORITIES.map((priority) => (
            <PriorityLane
              key={priority.id}
              priority={priority}
              risks={visibleRisks.filter((risk) => priorityOf(risk) === priority.id)}
              onAdd={() => setModal({ mode: 'create', priority: priority.id })}
              onEdit={(risk) => setModal({ mode: 'edit', risk })}
              onDelete={handleDelete}
              onUpdate={updateRisk}
            />
          ))}
        </main>

        <aside className="long-term-lane">
          <div className="long-term-heading">
            <span className="priority-letter">L</span>
            <div><h2>{LONG_TERM.name}</h2><p>{LONG_TERM.note}</p></div>
            <span className="priority-lane-count">{longTerm.length}</span>
          </div>
          <div className="long-term-rule"><Clock3 size={13} /><span>建议每周复盘一次，不进入每日紧急排序。</span></div>
          <div className="long-term-list">
            {longTerm.map((risk) => <RiskCard key={risk.id} risk={risk} onEdit={() => setModal({ mode: 'edit', risk })} onDelete={() => handleDelete(risk)} onUpdate={updateRisk} longTerm />)}
            {!longTerm.length && <EmptyLane copy="需要持续观察、但不急着解决的事放在这里。" onAdd={() => setModal({ mode: 'create', priority: 'L' })} />}
          </div>
          {longTerm.length > 0 && <button className="long-term-add" onClick={() => setModal({ mode: 'create', priority: 'L' })}><Plus size={13} /> 添加长期事项</button>}
        </aside>
      </div>

      <div className="task-flow-signature"><span /><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created by Deerflow</a><span /></div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? '新增关注事项' : '编辑关注事项'}>
        {modal && <RiskForm risk={modal.risk} defaultPriority={modal.priority} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function PriorityLane({ priority, risks, onAdd, onEdit, onDelete, onUpdate }) {
  return (
    <section className={`priority-lane priority-lane-${priority.tone}`}>
      <div className="priority-lane-heading">
        <span className="priority-letter">{priority.id}</span>
        <div><div className="flex items-center gap-2"><h2>{priority.name}</h2><span className="priority-meaning">{priority.meaning}</span></div><p>{priority.note}</p></div>
        <span className="priority-lane-count">{risks.length}</span>
        <button onClick={onAdd} aria-label={`添加 ${priority.id} 级事项`}><Plus size={15} /></button>
      </div>
      <div className="priority-lane-list">
        {risks.map((risk) => <RiskCard key={risk.id} risk={risk} onEdit={() => onEdit(risk)} onDelete={() => onDelete(risk)} onUpdate={onUpdate} />)}
        {!risks.length && <EmptyLane copy="这一层目前是空的。" onAdd={onAdd} compact />}
      </div>
    </section>
  );
}

function RiskCard({ risk, onEdit, onDelete, onUpdate, longTerm }) {
  return (
    <article className={`priority-risk-card ${risk.status === 'closed' ? 'is-closed' : ''} ${longTerm ? 'is-long-term' : ''}`}>
      <div className="priority-risk-copy">
        <div className="flex items-center gap-2 flex-wrap">
          <h3>{risk.title}</h3>
          {risk.status === 'mitigated' && <span className="risk-status-label mitigated"><Check size={9} /> 已缓解</span>}
          {risk.status === 'closed' && <span className="risk-status-label closed">已关闭</span>}
        </div>
        {risk.description && <p>{risk.description}</p>}
        {risk.strategy && <div className="risk-next-step"><ChevronRight size={11} /><span>{risk.strategy}</span></div>}
      </div>
      <div className="priority-risk-actions">
        <select value={priorityOf(risk)} onChange={(e) => onUpdate(risk, { priority: e.target.value }, `已调整为 ${e.target.value} 级`)} aria-label="调整优先级">
          {['S', 'A', 'B', 'C', 'L'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        {risk.status !== 'closed' && <button onClick={() => onUpdate(risk, { status: 'closed' }, '事项已关闭')} title="关闭事项"><Check size={13} /></button>}
        <button onClick={onEdit} title="编辑"><Edit2 size={13} /></button>
        <button onClick={onDelete} title="删除"><Trash2 size={13} /></button>
      </div>
    </article>
  );
}

function EmptyLane({ copy, onAdd, compact }) {
  return <button className={`priority-empty ${compact ? 'is-compact' : ''}`} onClick={onAdd}><Plus size={14} /><span>{copy}</span></button>;
}

function RiskForm({ risk, defaultPriority, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: risk?.title || '',
    description: risk?.description || '',
    priority: risk ? priorityOf(risk) : (defaultPriority || 'B'),
    strategy: risk?.strategy || '',
    status: risk?.status || 'monitoring',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) { setError('请写下需要关注的事情'); return; }
    setSubmitting(true);
    try { await onSave({ ...form, title: form.title.trim() }); } finally { setSubmitting(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label className="block text-xs font-medium text-slate-500 mb-1.5">关注事项</label><input value={form.title} onChange={(e) => { setForm((value) => ({ ...value, title: e.target.value })); setError(''); }} className={`input ${error ? 'error' : ''}`} autoFocus placeholder="例如：关键实验的样本量可能不足" />{error && <p className="field-error flex items-center gap-1"><AlertCircle size={11} />{error}</p>}</div>
      <div><label className="block text-xs font-medium text-slate-500 mb-1.5">具体情况</label><textarea value={form.description} onChange={(e) => setForm((value) => ({ ...value, description: e.target.value }))} className="input" rows={3} placeholder="它为什么值得关注？可能带来什么影响？" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-slate-500 mb-1.5">优先级</label><select value={form.priority} onChange={(e) => setForm((value) => ({ ...value, priority: e.target.value }))} className="select"><option value="S">S · 很紧急，很重要</option><option value="A">A · 紧急，重要</option><option value="B">B · 不紧急，但重要</option><option value="C">C · 不紧急不重要，但要做</option><option value="L">L · 长期关注</option></select></div>
        <div><label className="block text-xs font-medium text-slate-500 mb-1.5">状态</label><select value={form.status} onChange={(e) => setForm((value) => ({ ...value, status: e.target.value }))} className="select"><option value="monitoring">关注中</option><option value="mitigated">已缓解</option><option value="closed">已关闭</option></select></div>
      </div>
      <div><label className="block text-xs font-medium text-slate-500 mb-1.5">下一步怎么处理</label><textarea value={form.strategy} onChange={(e) => setForm((value) => ({ ...value, strategy: e.target.value }))} className="input" rows={2} placeholder="写一个具体动作，而不是泛泛的应对策略" /></div>
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100"><button type="button" onClick={onCancel} className="btn btn-secondary">取消</button><button type="submit" disabled={submitting} className="btn btn-primary">{submitting && <Loader2 size={14} className="animate-spin" />}保存</button></div>
    </form>
  );
}

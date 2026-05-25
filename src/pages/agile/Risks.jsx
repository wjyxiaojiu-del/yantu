import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Shield, AlertCircle, CheckSquare, Square, Trash, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { SkeletonTable } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';
import Modal from '../../components/Modal';

export default function Risks() {
  const { projectId } = useProject();
  const toast = useToast();
  const [risks, setRisks] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const load = async () => {
    try {
      const r = await api.getRisks({ project_id: projectId });
      setRisks(r);
      setError(null);
    } catch (e) {
      setError(e.message);
      toast.error('加载风险数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') await api.createRisk({ ...data, project_id: projectId });
      else await api.updateRisk(modal.risk.id, data);
      setModal(null);
      toast.success(modal.mode === 'create' ? '风险创建成功' : '风险更新成功');
      load();
    } catch (e) {
      toast.error('保存失败');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除此风险？')) return;
    try {
      await api.deleteRisk(id);
      toast.success('风险已删除');
      load();
    } catch (e) {
      toast.error('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 个风险？`)) return;
    try {
      await api.batchDeleteRisks([...selected]);
      toast.success(`已删除 ${selected.size} 个风险`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error('批量删除失败：' + e.message);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === risks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(risks.map(r => r.id)));
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateRisk(id, { status });
      load();
    } catch (e) {
      toast.error('状态更新失败');
    }
  };

  const matrix = Array.from({ length: 5 }, (_, prob) =>
    Array.from({ length: 5 }, (_, imp) => {
      const score = (5 - prob) * (imp + 1);
      const level = score >= 16 ? 'high' : score >= 9 ? 'medium' : 'low';
      const matched = risks.filter(r => r.probability === 5 - prob && r.impact === imp + 1);
      return { prob: 5 - prob, imp: imp + 1, score, level, risks: matched };
    })
  );

  if (loading) return <SkeletonTable rows={5} cols={7} />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">风险管控</h1>
          <p className="text-sm text-slate-400 mt-1">识别、评估与跟踪项目风险</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={handleBatchDelete} className="btn btn-danger gap-2 animate-popIn">
              <Trash size={15} /> 删除选中 ({selected.size})
            </button>
          )}
          <button onClick={() => setModal({ mode: 'create' })} className="btn btn-primary">
            <Plus size={16} /> 新建风险
          </button>
        </div>
      </div>

      {/* Risk Matrix */}
      <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
        <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2"><Shield size={15} className="text-orange-500" /> 风险评估矩阵</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs">
            <thead>
              <tr>
                <th className="py-2 px-3" colSpan={1}></th>
                <th className="py-2 px-3 text-slate-400 font-medium" colSpan={5}>影响程度 →</th>
              </tr>
              <tr>
                <th className="py-1 px-3 text-slate-400 font-medium">概率 ↓</th>
                {[1, 2, 3, 4, 5].map(i => <th key={i} className="py-1 px-3 text-slate-400 font-medium">{i}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.reverse().map((row, ri) => (
                <tr key={ri}>
                  <td className="py-1.5 px-3 font-medium text-slate-500">{row[0].prob}</td>
                  {row.map((cell, ci) => {
                    const bg = cell.level === 'high' ? 'rgba(239,68,68,0.06)' : cell.level === 'medium' ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)';
                    const hoverBg = cell.level === 'high' ? 'rgba(239,68,68,0.1)' : cell.level === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)';
                    const text = cell.level === 'high' ? 'text-red-600' : cell.level === 'medium' ? 'text-amber-600' : 'text-emerald-600';
                    return (
                      <td key={cell.imp} className={`py-3 px-2 ${text} rounded-lg cursor-default font-bold`}
                        style={{ background: bg, animation: `scaleIn .3s var(--spring-bounce) ${ri * 30 + ci * 20}ms both`, transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                        onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                        onMouseLeave={e => e.currentTarget.style.background = bg}>
                        <div>{cell.score}</div>
                        {cell.risks.length > 0 && <div className="text-slate-400 mt-0.5 font-normal">{cell.risks.length}个</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-end gap-5 mt-3 text-[11px]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }} /> 高风险 ≥16</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.15)' }} /> 中风险 9-15</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)' }} /> 低风险 {'<'}9</span>
          </div>
        </div>
      </div>

      {/* Risk List */}
      <div className="card overflow-hidden" style={{ animation: 'slideUp .5s var(--spring-bounce) .1s both' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(241,245,249,0.5)' }}>
              <th className="text-left px-4 py-3 w-10">
                <button onClick={toggleSelectAll} className="text-slate-400 hover:text-orange-500 transition-colors">
                  {selected.size === risks.length && risks.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">风险</th>
              <th className="text-center px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">概率</th>
              <th className="text-center px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">影响</th>
              <th className="text-center px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">等级</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">应对策略</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">状态</th>
              <th className="text-center px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r, i) => (
              <tr key={r.id} className={`table-row group ${selected.has(r.id) ? 'bg-orange-50/30' : ''}`}
                style={{ animation: `slideInRight .3s var(--spring-bounce) ${i * 40}ms both` }}>
                <td className="px-4 py-3.5">
                  <button onClick={() => toggleSelect(r.id)}
                    className={`transition-all duration-300 ${selected.has(r.id) ? 'text-orange-500 scale-110' : 'text-slate-300 hover:text-orange-400'}`}
                    style={{ transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                    {selected.has(r.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </td>
                <td className="px-5 py-3.5">
                  <div className="font-medium text-slate-800">{r.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{r.description}</div>
                </td>
                <td className="px-5 py-3.5 text-center text-slate-600 font-medium">{r.probability}</td>
                <td className="px-5 py-3.5 text-center text-slate-600 font-medium">{r.impact}</td>
                <td className="px-5 py-3.5 text-center">
                  <span className={`badge ${r.level === 'high' ? 'badge-s' : r.level === 'medium' ? 'badge-b' : 'badge-d'}`}>
                    {r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-500 max-w-xs truncate">{r.strategy}</td>
                <td className="px-5 py-3.5">
                  <select value={r.status} onChange={e => handleStatusChange(r.id, e.target.value)} className="select w-24 text-xs py-1.5">
                    <option value="monitoring">监控中</option>
                    <option value="mitigated">已缓解</option>
                    <option value="closed">已关闭</option>
                  </select>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button onClick={() => setModal({ mode: 'edit', risk: r })} className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-500 transition-all duration-200"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all duration-200"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {risks.length === 0 && (
          <div className="text-center py-16 text-slate-400 animate-fadeIn">
            <div className="text-4xl mb-2">🛡️</div>
            <div className="text-sm">暂无风险记录</div>
          </div>
        )}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? '新建风险' : '编辑风险'}>
        {modal && <RiskForm risk={modal.risk} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function RiskForm({ risk, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: risk?.title || '',
    description: risk?.description || '',
    probability: risk?.probability || 3,
    impact: risk?.impact || 3,
    strategy: risk?.strategy || '',
    status: risk?.status || 'monitoring',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };
  const autoLevel = (p, i) => p * i >= 16 ? 'high' : p * i >= 9 ? 'medium' : 'low';

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = '请填写风险标题';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try { await onSave({ ...form, level: autoLevel(form.probability, form.impact) }); } finally { setSubmitting(false); }
  };

  const levelInfo = autoLevel(form.probability, form.impact);
  const score = form.probability * form.impact;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">风险标题 <span className="text-red-400">*</span></label>
        <input value={form.title} onChange={e => set('title', e.target.value)} className={`input ${errors.title ? 'error' : ''}`} placeholder="简要描述风险" />
        {errors.title && <p className="field-error flex items-center gap-1"><AlertCircle size={11} />{errors.title}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">详细描述</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} className="input" rows={2} placeholder="风险的具体情况..." />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">发生概率</label>
          <select value={form.probability} onChange={e => set('probability', +e.target.value)} className="select">
            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v} - {['极低', '低', '中', '高', '极高'][v - 1]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">影响程度</label>
          <select value={form.impact} onChange={e => set('impact', +e.target.value)} className="select">
            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v} - {['极低', '低', '中', '高', '极高'][v - 1]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">自动评估</label>
          <div className={`badge mt-2 ${levelInfo === 'high' ? 'badge-s' : levelInfo === 'medium' ? 'badge-b' : 'badge-d'}`}>
            {score}分 · {levelInfo === 'high' ? '高风险' : levelInfo === 'medium' ? '中风险' : '低风险'}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">应对策略</label>
        <textarea value={form.strategy} onChange={e => set('strategy', e.target.value)} className="input" rows={3} placeholder="如何应对此风险？" />
      </div>
      <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid rgba(241,245,249,0.5)' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary">取消</button>
        <button type="submit" disabled={submitting} className="btn btn-primary flex items-center gap-1.5">
          {submitting && <Loader2 size={14} className="animate-spin" />}保存
        </button>
      </div>
    </form>
  );
}

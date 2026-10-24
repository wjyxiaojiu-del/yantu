import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ListChecks, Plus, Search, Star, Play, Pause, CheckCircle2, XCircle,
  Pencil, Copy, Trash2, ChevronUp, ChevronDown, ArrowLeft, Timer, Loader2,
} from 'lucide-react';
import api from '../../api';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { SkeletonSpinner } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import { useProject } from '../../context/ProjectContext';
import {
  countItems, doneItems, toggleStep, extractVariables, replaceVars,
  formatDuration, liveElapsedMs,
} from '../../utils/sop';

const CATEGORIES = ['科研', '学习', '开发', '生活', '其他'];
const STATUS_META = {
  running: { label: '执行中', dot: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' },
  paused: { label: '已暂停', dot: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' },
  completed: { label: '已完成', dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  abandoned: { label: '已放弃', dot: 'bg-slate-400', text: 'text-slate-500', bg: 'bg-slate-100' },
};

let uidCounter = 0;
const newStepId = () => `n${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.abandoned;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.bg} ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
    </span>
  );
}

function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-light))' }} />
    </div>
  );
}

/* ---------- 模板编辑弹窗 ---------- */

function StepsEditor({ steps, onChange }) {
  const update = (next) => onChange(next);

  const addStep = () => update([...steps, { id: newStepId(), title: '', note: '', substeps: [] }]);
  const removeStep = (i) => update(steps.filter((_, x) => x !== i));
  const moveStep = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const patchStep = (i, field, value) => {
    const next = steps.map((s, x) => (x === i ? { ...s, [field]: value } : s));
    update(next);
  };
  const addSub = (i) => {
    const next = steps.map((s, x) => (x === i
      ? { ...s, substeps: [...(s.substeps || []), { id: newStepId(), title: '' }] }
      : s));
    update(next);
  };
  const patchSub = (i, k, field, value) => {
    const next = steps.map((s, x) => (x === i
      ? { ...s, substeps: s.substeps.map((u, y) => (y === k ? { ...u, [field]: value } : u)) }
      : s));
    update(next);
  };
  const removeSub = (i, k) => {
    const next = steps.map((s, x) => (x === i
      ? { ...s, substeps: s.substeps.filter((_, y) => y !== k) }
      : s));
    update(next);
  };

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={step.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 shrink-0 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-400 flex items-center justify-center">{i + 1}</span>
            <input
              value={step.title}
              onChange={e => patchStep(i, 'title', e.target.value)}
              placeholder="步骤标题，可用 {{变量}}"
              className="input flex-1 py-1.5 text-sm bg-white"
              autoFocus={!step.title}
            />
            <div className="flex items-center shrink-0">
              <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30" aria-label="上移"><ChevronUp size={14} /></button>
              <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30" aria-label="下移"><ChevronDown size={14} /></button>
              <button type="button" onClick={() => removeStep(i)} className="p-1 text-slate-300 hover:text-red-500" aria-label="删除步骤"><Trash2 size={14} /></button>
            </div>
          </div>
          <input
            value={step.note || ''}
            onChange={e => patchStep(i, 'note', e.target.value)}
            placeholder="备注（可选）"
            className="input w-full py-1.5 text-xs bg-white"
          />
          {(step.substeps || []).length > 0 && (
            <div className="pl-7 space-y-1.5">
              {step.substeps.map((sub, k) => (
                <div key={sub.id} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                  <input
                    value={sub.title}
                    onChange={e => patchSub(i, k, 'title', e.target.value)}
                    placeholder="子步骤"
                    className="input flex-1 py-1 text-xs bg-white"
                  />
                  <button type="button" onClick={() => removeSub(i, k)} className="p-1 text-slate-300 hover:text-red-500 shrink-0" aria-label="删除子步骤"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => addSub(i)} className="ml-7 text-[11px] font-medium text-slate-400 hover:text-[var(--accent)]">+ 子步骤</button>
        </div>
      ))}
      <button type="button" onClick={addStep} className="w-full py-2.5 rounded-xl border border-dashed border-slate-200 text-xs font-medium text-slate-400 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
        + 添加步骤
      </button>
    </div>
  );
}

function TemplateModal({ template, onClose, onSaved }) {
  const toast = useToast();
  const { projectId } = useProject();
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState(template?.category || '生活');
  const [tags, setTags] = useState((template?.tags || []).join(' '));
  const [favorite, setFavorite] = useState(!!template?.favorite);
  const [steps, setSteps] = useState(
    (template?.steps || []).map(s => ({
      id: s.id || newStepId(),
      title: s.title,
      note: s.note || '',
      substeps: (s.substeps || []).map(u => ({ id: u.id || newStepId(), title: u.title })),
    })),
  );
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (!steps.length) { toast.error('至少需要一个步骤'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        category,
        tags: tags.split(/[\s,，]+/).map(t => t.trim()).filter(Boolean),
        favorite,
        steps: steps.map(s => ({
          id: s.id, title: s.title.trim(), note: (s.note || '').trim(),
          substeps: (s.substeps || []).map(u => ({ id: u.id, title: u.title.trim() })),
        })),
      };
      if (template) {
        await api.updateSopTemplate(template.id, payload);
        toast.success('模板已更新');
      } else {
        await api.createSopTemplate({ ...payload, project_id: projectId });
        toast.success('模板已创建');
      }
      onSaved();
    } catch (e) {
      toast.error(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={template ? '编辑模板' : '新建模板'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">模板名称</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} className="input" placeholder="例如：论文投稿前检查" maxLength={80} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">描述</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className="input" placeholder="这个流程是做什么的（可选）" maxLength={200} />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">分类</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="input">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">标签</label>
            <input value={tags} onChange={e => setTags(e.target.value)} className="input" placeholder="空格分隔（可选）" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={favorite} onChange={e => setFavorite(e.target.checked)} className="w-4 h-4 accent-amber-400" />
          <span className="text-xs font-medium text-slate-500">收藏到常用</span>
        </label>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">步骤</label>
          <StepsEditor steps={steps} onChange={setSteps} />
          <p className="mt-2 text-[10px] text-slate-400">在标题或备注里写 {'{{变量名}}'}，开始执行时统一填写。</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-secondary">取消</button>
          <button type="submit" disabled={!name.trim() || saving} className="btn btn-primary">
            {saving ? <><Loader2 size={14} className="animate-spin" />保存中…</> : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- 开始执行：填写变量 ---------- */

function StartModal({ template, onClose, onStarted }) {
  const toast = useToast();
  const vars = useMemo(() => extractVariables(template.steps), [template]);
  const [values, setValues] = useState({});
  const [starting, setStarting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setStarting(true);
    try {
      const instance = await api.startSopInstance({ template_id: template.id, variables: values });
      onStarted(instance);
    } catch (e) {
      toast.error(e.message || '启动失败');
      setStarting(false);
    }
  };

  return (
    <Modal title={`开始执行：${template.name}`} onClose={onClose}>
      {vars.length === 0 ? (
        <div className="text-sm text-slate-500 py-2">该模板没有变量，直接开始。</div>
      ) : (
        <div className="space-y-3 py-1">
          <p className="text-xs text-slate-400">填写本次执行用到的变量值：</p>
          {vars.map(name => (
            <div key={name}>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">{name}</label>
              <input
                autoFocus
                value={values[name] || ''}
                onChange={e => setValues(v => ({ ...v, [name]: e.target.value }))}
                className="input"
                placeholder={`{{${name}}}`}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="btn btn-secondary">取消</button>
        <button onClick={submit} disabled={starting} className="btn btn-primary">
          {starting ? <><Loader2 size={14} className="animate-spin" />启动中…</> : <><Play size={14} />开始执行</>}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- 执行视图 ---------- */

function RunView({ instance, onBack, onPatch }) {
  const toast = useToast();
  const { projectId } = useProject();
  const [note, setNote] = useState(instance.note || '');
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState(false);
  const noteTimer = useRef(null);
  const noteSavedFor = useRef(instance.id);

  useEffect(() => {
    if (noteSavedFor.current !== instance.id) {
      noteSavedFor.current = instance.id;
      setNote(instance.note || '');
      setLogged(false);
    }
  }, [instance]);

  const total = countItems(instance.steps);
  const done = doneItems(instance.steps);
  const vars = instance.variables || {};
  const status = instance.status;
  const isTerminal = status === 'completed' || status === 'abandoned';

  const patchInstance = async (patch) => {
    const previous = instance;
    onPatch({ ...instance, ...patch });
    try {
      const updated = await api.updateSopInstance(instance.id, patch);
      onPatch(updated);
      return updated;
    } catch (e) {
      onPatch(previous);
      toast.error(e.message || '保存失败');
      return null;
    }
  };

  const toggle = (stepId, subId, value) => {
    if (isTerminal) return;
    onPatch({ ...instance, steps: toggleStep(instance.steps, stepId, subId, value) });
    patchInstance({ steps: toggleStep(instance.steps, stepId, subId, value) }).then(updated => {
      if (updated && doneItems(updated.steps) === countItems(updated.steps) && updated.status === 'running') {
        toast.success('全部完成，可以点击「完成」收尾');
      }
    });
  };

  const changeStatus = async (target, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    await patchInstance({ status: target });
    setBusy(false);
  };

  const writeDailyLog = async () => {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const line = `完成 SOP「${instance.name}」：${done}/${total} 项，耗时 ${formatDuration(liveElapsedMs(instance))}。`;
      const logs = await api.getDailyLogs({ project_id: projectId, date });
      const existing = Array.isArray(logs) ? logs.find(l => l.date === date) : null;
      await api.createDailyLog({
        project_id: projectId,
        date,
        notes: existing?.notes ? `${existing.notes}\n${line}` : line,
      });
      setLogged(true);
      toast.success('已写入今日每日记录');
    } catch (e) {
      toast.error(e.message || '写入每日记录失败');
    }
  };

  const onNoteChange = (value) => {
    setNote(value);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      api.updateSopInstance(instance.id, { note: value }).catch(() => toast.error('备注保存失败，稍后重试'));
    }, 600);
  };

  const meta = STATUS_META[status];

  return (
    <div className="space-y-5 max-w-[900px]">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-ghost p-2 rounded-lg text-slate-400 hover:text-slate-600" aria-label="返回列表"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">
              {replaceVars(instance.name, vars)}
            </h1>
            <StatusBadge status={status} />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {instance.category} · 开始于 {instance.started_at?.slice(0, 16).replace('T', ' ')}
            {Object.keys(vars).length > 0 && ` · 变量：${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('，')}`}
          </p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-end justify-between mb-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-slate-900">{done}</span>
            <span className="text-sm text-slate-400">/ {total} 项</span>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
            <Timer size={13} />{formatDuration(liveElapsedMs(instance))}
            {status === 'running' && <span className="text-[10px] text-slate-300">计时中</span>}
            {status === 'paused' && <span className="text-[10px] text-slate-300">暂停不计时</span>}
          </span>
        </div>
        <ProgressBar done={done} total={total} />
        <div className="flex items-center gap-2 mt-4">
          {!isTerminal && (
            <>
              {status === 'running'
                ? <button onClick={() => changeStatus('paused')} disabled={busy} className="btn btn-secondary"><Pause size={14} />暂停</button>
                : <button onClick={() => changeStatus('running')} disabled={busy} className="btn btn-primary"><Play size={14} />继续</button>}
              <button onClick={() => changeStatus('completed', `确认完成「${instance.name}」？未勾满也可完成，完成率保留实际值。`)} disabled={busy} className="btn btn-primary bg-emerald-500 bg-none hover:bg-emerald-600" style={{ background: '#10b981' }}>
                <CheckCircle2 size={14} />完成
              </button>
              <button onClick={() => changeStatus('abandoned', `确认放弃「${instance.name}」？放弃后不可恢复。`)} disabled={busy} className="btn btn-secondary text-red-500 hover:text-red-600">
                <XCircle size={14} />放弃
              </button>
            </>
          )}
          {isTerminal && (
            <>
              {status === 'completed' && !logged && (
                <button onClick={writeDailyLog} className="btn btn-secondary"><ListChecks size={14} />写入今日每日记录</button>
              )}
              {logged && <span className="text-xs text-emerald-600 font-medium">✓ 已写入每日记录</span>}
              <span className="ml-auto text-xs text-slate-400">
                {status === 'completed' ? '已完成' : '已放弃'} · {instance.ended_at?.slice(0, 16).replace('T', ' ')}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="card divide-y divide-slate-50">
        {instance.steps.map(step => {
          const subs = step.substeps || [];
          return (
            <div key={step.id} className="p-4">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggle(step.id, null, !step.done)}
                  disabled={isTerminal}
                  aria-label={step.done ? '取消勾选步骤' : '勾选步骤'}
                  className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
                    ${step.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 hover:border-emerald-400'}
                    ${isTerminal ? 'cursor-default' : ''}`}
                >
                  {step.done && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {replaceVars(step.title, vars)}
                  </p>
                  {step.note && <p className="text-xs text-slate-400 mt-1">{replaceVars(step.note, vars)}</p>}
                  {subs.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {subs.map(sub => (
                        <div key={sub.id} className="flex items-start gap-2.5 pl-1">
                          <button
                            onClick={() => toggle(step.id, sub.id, !sub.done)}
                            disabled={isTerminal}
                            aria-label={sub.done ? '取消勾选子步骤' : '勾选子步骤'}
                            className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-all
                              ${sub.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 hover:border-emerald-400'}
                              ${isTerminal ? 'cursor-default' : ''}`}
                          >
                            {sub.done && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                          </button>
                          <span className={`text-xs ${sub.done ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                            {replaceVars(sub.title, vars)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-4">
        <label className="block text-xs font-medium text-slate-500 mb-2">执行备注</label>
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          disabled={isTerminal}
          rows={3}
          className="input resize-none"
          placeholder="记录本次执行的情况（自动保存）"
        />
      </div>
    </div>
  );
}

/* ---------- 主页面 ---------- */

export default function SopFlow() {
  const toast = useToast();
  const { projectId } = useProject();
  const [templates, setTemplates] = useState([]);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('全部');
  const [editing, setEditing] = useState(null);       // null | {} (新建) | {template}
  const [starting, setStarting] = useState(null);     // template
  const [runId, setRunId] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('全部');
  const [, setTick] = useState(0);

  const load = async () => {
    try {
      const [tpls, insts] = await Promise.all([
        api.getSopTemplates({ project_id: projectId }),
        api.getSopInstances({ project_id: projectId }),
      ]);
      setTemplates(Array.isArray(tpls) ? tpls : []);
      setInstances(Array.isArray(insts) ? insts : []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (projectId) { setLoading(true); load(); } }, [projectId]);

  const activeInstances = instances.filter(i => i.status === 'running' || i.status === 'paused');
  const historyInstances = instances.filter(i => i.status === 'completed' || i.status === 'abandoned');

  // 执行中的实例每秒刷新耗时显示
  useEffect(() => {
    if (!activeInstances.some(i => i.status === 'running')) return undefined;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [activeInstances]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter(t => {
      const matchCat = catFilter === '全部' || (catFilter === '收藏' ? t.favorite : t.category === catFilter);
      if (!matchCat) return false;
      if (!q) return true;
      const haystack = [t.name, t.description, ...(t.tags || []),
        ...t.steps.flatMap(s => [s.title, s.note, ...(s.substeps || []).map(u => u.title)])].join('\n').toLowerCase();
      return haystack.includes(q);
    });
  }, [templates, search, catFilter]);

  const runningInstance = instances.find(i => i.id === runId);

  const duplicate = async (template) => {
    try {
      await api.createSopTemplate({
        project_id: projectId,
        name: `${template.name} - 副本`,
        description: template.description,
        category: template.category,
        tags: template.tags,
        favorite: false,
        steps: template.steps.map(s => ({
          id: newStepId(), title: s.title, note: s.note || '',
          substeps: (s.substeps || []).map(u => ({ id: newStepId(), title: u.title })),
        })),
      });
      toast.success('模板已复制');
      load();
    } catch (e) {
      toast.error(e.message || '复制失败');
    }
  };

  const removeTemplate = async (template) => {
    const hasActive = activeInstances.some(i => i.template_id === template.id);
    const hint = hasActive ? `模板「${template.name}」有进行中的执行，删除模板不影响已启动的执行。` : '';
    if (!window.confirm(`${hint}确定删除模板「${template.name}」？`)) return;
    try {
      await api.deleteSopTemplate(template.id);
      toast.success('模板已删除');
      load();
    } catch (e) {
      toast.error(e.message || '删除失败');
    }
  };

  const removeInstance = async (instance) => {
    if (!window.confirm(`确定删除执行记录「${instance.name}」？不可恢复。`)) return;
    try {
      await api.deleteSopInstance(instance.id);
      setRunId(current => (current === instance.id ? null : current));
      load();
    } catch (e) {
      toast.error(e.message || '删除失败');
    }
  };

  if (loading) return <SkeletonSpinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (runningInstance) {
    return (
      <RunView
        instance={runningInstance}
        onBack={() => { setRunId(null); load(); }}
        onPatch={(next) => setInstances(current => current.map(i => (i.id === next.id ? next : i)))}
      />
    );
  }

  const historyFiltered = historyFilter === '全部'
    ? historyInstances
    : historyInstances.filter(i => i.status === (historyFilter === '已完成' ? 'completed' : 'abandoned'));

  return (
    <div className="space-y-5 max-w-[1100px]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SOP 流程</h1>
          <p className="text-sm text-slate-400 mt-1">把常做的事存成模板，照清单推进，暂停后可继续</p>
        </div>
        <button onClick={() => setEditing({})} className="btn btn-primary"><Plus size={15} />新建模板</button>
      </div>

      {/* 进行中 */}
      {activeInstances.length > 0 && (
        <section>
          <h2 className="text-xs font-bold tracking-[0.16em] text-slate-400 mb-2.5">进行中</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeInstances.map(inst => {
              const total = countItems(inst.steps);
              const done = doneItems(inst.steps);
              return (
                <button key={inst.id} onClick={() => setRunId(inst.id)}
                  className="card p-4 text-left hover:shadow-md transition-all">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-slate-800 truncate">{inst.name}</span>
                    <StatusBadge status={inst.status} />
                  </div>
                  <ProgressBar done={done} total={total} />
                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                    <span>{done}/{total} 项</span>
                    <span className="inline-flex items-center gap-1"><Timer size={11} />{formatDuration(liveElapsedMs(inst))}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 模板列表 */}
      <section>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索模板、步骤或标签..." className="input pl-10" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['全部', '收藏', ...CATEGORIES].map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${catFilter === cat ? 'text-white shadow-md' : 'bg-white/60 text-slate-500 hover:bg-white'}`}
                style={catFilter === cat ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="card divide-y divide-slate-50">
          {filteredTemplates.map(t => (
            <div key={t.id} className="flex items-center gap-3 p-4 hover:bg-slate-50/40 transition-all group">
              <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                <ListChecks size={16} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setStarting(t)}>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-700 truncate">{t.name}</p>
                  {t.favorite && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t.category}</span>
                  <span className="text-[10px] text-slate-300">{countItems(t.steps)} 项</span>
                  {t.tags?.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/5 text-[var(--accent)]">{tag}</span>
                  ))}
                  {t.description && <span className="text-[10px] text-slate-300 truncate">{t.description}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => setStarting(t)} className="btn btn-primary py-1.5 px-3 text-xs"><Play size={12} />执行</button>
                <button onClick={() => setEditing({ template: t })} className="p-1.5 text-slate-300 hover:text-slate-600" aria-label="编辑模板"><Pencil size={14} /></button>
                <button onClick={() => duplicate(t)} className="p-1.5 text-slate-300 hover:text-slate-600" aria-label="复制模板"><Copy size={14} /></button>
                <button onClick={() => removeTemplate(t)} className="p-1.5 text-slate-300 hover:text-red-500" aria-label="删除模板"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {filteredTemplates.length === 0 && (
            <div className="text-center py-16">
              <ListChecks className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">{templates.length === 0 ? '还没有模板，把常做的事存成 SOP 吧' : '没有匹配的模板'}</p>
              {templates.length === 0 && (
                <button onClick={() => setEditing({})} className="mt-3 text-xs font-semibold text-[var(--accent)]">+ 新建第一个模板</button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 历史 */}
      {historyInstances.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-2.5">
            <h2 className="text-xs font-bold tracking-[0.16em] text-slate-400">历史记录</h2>
            <div className="flex items-center gap-1.5">
              {['全部', '已完成', '已放弃'].map(f => (
                <button key={f} onClick={() => setHistoryFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${historyFilter === f ? 'bg-slate-200/70 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="card divide-y divide-slate-50">
            {historyFiltered.map(inst => {
              const total = countItems(inst.steps);
              const done = doneItems(inst.steps);
              return (
                <div key={inst.id} className="flex items-center gap-3 p-3.5 hover:bg-slate-50/40 transition-all group">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setRunId(inst.id)}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-600 truncate">{inst.name}</p>
                      <StatusBadge status={inst.status} />
                    </div>
                    <p className="text-[10px] text-slate-300 mt-0.5">
                      {done}/{total} 项 · 耗时 {formatDuration(liveElapsedMs(inst))} · {inst.ended_at?.slice(0, 16).replace('T', ' ')}
                    </p>
                  </div>
                  <button onClick={() => removeInstance(inst)} className="p-1.5 text-slate-300 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" aria-label="删除记录"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {editing && (
        <TemplateModal
          template={editing.template || null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {starting && (
        <StartModal
          template={starting}
          onClose={() => setStarting(null)}
          onStarted={(instance) => { setStarting(null); setInstances(current => [instance, ...current]); setRunId(instance.id); }}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Beaker, BookOpen, Check, CircleAlert, FlaskConical, Lightbulb, Link2, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import ErrorState from '../../components/ErrorState';
import api from '../../api';

const NODE_META = {
  question: { label: '研究问题', color: '#2563eb', bg: '#eff6ff', icon: Search, hint: '你真正想解释什么？' },
  hypothesis: { label: '假设', color: '#7c3aed', bg: '#f5f3ff', icon: Lightbulb, hint: '你认为会发生什么？' },
  experiment: { label: '实验', color: '#d97706', bg: '#fffbeb', icon: FlaskConical, hint: '用什么方法验证？' },
  evidence: { label: '证据', color: '#059669', bg: '#ecfdf5', icon: Beaker, hint: '观察或数据说明什么？' },
  conclusion: { label: '结论', color: '#0891b2', bg: '#ecfeff', icon: Check, hint: '目前可以得出什么？' },
  paper: { label: '论文', color: '#db2777', bg: '#fdf2f8', icon: BookOpen, hint: '如何沉淀和表达？' },
};

const NODE_ORDER = ['question', 'hypothesis', 'experiment', 'evidence', 'conclusion', 'paper'];

const EMPTY_FORM = { nodeType: 'question', title: '', content: '' };

export default function ResearchMap() {
  const { projectId } = useProject();
  const toast = useToast();
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [linkForm, setLinkForm] = useState({ sourceId: '', targetId: '', relation: 'supports' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const next = await api.getResearchMapSummary({ projectId });
      setSummary(next || { nodes: [], edges: [], gaps: [], counts: {} });
      setError(null);
    } catch (err) {
      setError(err.message);
      toast.error('加载研究地图失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

  const nodes = summary?.nodes || [];
  const edges = summary?.edges || [];
  const gaps = summary?.gaps || [];
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((node) => [node.id, node])), [nodes]);
  const grouped = useMemo(() => NODE_ORDER.reduce((groups, type) => {
    groups[type] = nodes.filter((node) => node.nodeType === type);
    return groups;
  }, {}), [nodes]);

  const createNode = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setBusy('node');
    try {
      await api.createResearchMapNode({ projectId, nodeType: form.nodeType, title: form.title.trim(), content: form.content.trim() });
      setForm(EMPTY_FORM);
      setComposerOpen(false);
      toast.success('研究节点已加入地图');
      await load();
    } catch (err) { toast.error('新增节点失败：' + err.message); }
    finally { setBusy(''); }
  };

  const createEdge = async (event) => {
    event.preventDefault();
    if (!linkForm.sourceId || !linkForm.targetId) return;
    setBusy('edge');
    try {
      await api.createResearchMapEdge({ projectId, sourceId: Number(linkForm.sourceId), targetId: Number(linkForm.targetId), relation: linkForm.relation });
      setLinkForm({ sourceId: '', targetId: '', relation: 'supports' });
      toast.success('研究关系已连接');
      await load();
    } catch (err) { toast.error('连接失败：' + err.message); }
    finally { setBusy(''); }
  };

  const deleteNode = async (node) => {
    if (!window.confirm(`删除“${node.title}”及其关系？`)) return;
    setBusy(`delete-${node.id}`);
    try { await api.deleteResearchMapNode(node.id); toast.success('节点已删除'); await load(); }
    catch (err) { toast.error('删除失败：' + err.message); }
    finally { setBusy(''); }
  };

  if (loading) return <ResearchMapLoading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="research-map-shell mx-auto max-w-[1500px] space-y-5 pb-8">
      <header className="research-map-header workbench-reveal">
        <div><div className="research-map-eyebrow"><Link2 size={12} /> RESEARCH LOGIC</div><h1>研究地图</h1><p>把问题、假设、实验和证据串成一条能继续推进的链路。</p></div>
        <div className="research-map-actions"><button className="btn btn-secondary gap-1.5" onClick={load}><RefreshCw size={14} /> 刷新</button><button className="btn btn-primary gap-1.5" onClick={() => setComposerOpen((open) => !open)}><Plus size={15} /> 新增节点</button></div>
      </header>

      <section className="research-map-stats workbench-reveal workbench-reveal-delay-1">
        <div><span>节点</span><strong>{summary?.totalNodes || 0}</strong><small>问题到论文</small></div>
        <div><span>关系</span><strong>{summary?.totalEdges || 0}</strong><small>已建立的证据链</small></div>
        <div className={gaps.length ? 'is-warning' : 'is-good'}><span>研究缺口</span><strong>{gaps.length}</strong><small>{gaps.length ? '需要补一段链路' : '链路目前完整'}</small></div>
        <div className="research-map-principle"><ArrowRight size={18} /><p><b>下一步优先补链路</b><span>先让每个假设都有实验，再让实验留下证据。</span></p></div>
      </section>

      {composerOpen && <section className="research-map-composer workbench-panel workbench-reveal">
        <form onSubmit={createNode}>
          <div className="research-map-composer-title"><div><Plus size={15} /><b>加入一个研究节点</b></div><span>先写清楚，再连接它</span></div>
          <div className="research-map-form-grid"><select value={form.nodeType} onChange={(event) => setForm({ ...form, nodeType: event.target.value })} className="input">{NODE_ORDER.map((type) => <option key={type} value={type}>{NODE_META[type].label}</option>)}</select><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={NODE_META[form.nodeType].hint} autoFocus /><input className="input" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="补充一句背景、方法或判断（可选）" /><button className="btn btn-primary" disabled={busy !== ''}>{busy === 'node' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}保存节点</button></div>
        </form>
      </section>}

      <section className="research-map-board workbench-reveal workbench-reveal-delay-2">
        <div className="research-map-lanes">{NODE_ORDER.map((type) => {
          const meta = NODE_META[type]; const Icon = meta.icon;
          return <div key={type} className="research-map-lane" style={{ '--lane-color': meta.color, '--lane-bg': meta.bg }}><div className="research-map-lane-head"><span><Icon size={14} /><b>{meta.label}</b></span><em>{grouped[type].length}</em></div><div className="research-map-lane-body">{grouped[type].map((node) => <article id={`research-node-${node.id}`} key={node.id} className={`research-map-node ${node.status !== 'active' ? 'is-muted' : ''}`}><div className="research-map-node-top"><span>{node.status === 'done' ? '已完成' : node.status === 'blocked' ? '被阻塞' : '进行中'}</span><button onClick={() => deleteNode(node)} aria-label={`删除${node.title}`} disabled={busy !== ''}><Trash2 size={11} /></button></div><h3>{node.title}</h3>{node.content && <p>{node.content}</p>}{(node.linkedTaskId || node.linkedLiteratureId) && <small>{node.linkedTaskId ? '已关联任务' : '已关联文献'}</small>}</article>)}{!grouped[type].length && <div className="research-map-lane-empty">还没有{meta.label}<button onClick={() => { setForm({ ...EMPTY_FORM, nodeType: type }); setComposerOpen(true); }}>添加</button></div>}</div></div>;
        })}</div>
      </section>

      <section className="research-map-lower-grid">
        <div className="workbench-panel research-map-linker"><div className="research-map-section-title"><div><Link2 size={15} /><h2>连接研究关系</h2></div><span>问题 → 假设 → 实验 → 证据 → 结论 → 论文</span></div><form onSubmit={createEdge} className="research-map-link-form"><select value={linkForm.sourceId} onChange={(event) => setLinkForm({ ...linkForm, sourceId: event.target.value })} className="input"><option value="">起点节点</option>{nodes.map((node) => <option key={node.id} value={node.id}>{NODE_META[node.nodeType].label} · {node.title}</option>)}</select><ArrowRight size={15} className="text-slate-300" /><select value={linkForm.targetId} onChange={(event) => setLinkForm({ ...linkForm, targetId: event.target.value })} className="input"><option value="">终点节点</option>{nodes.map((node) => <option key={node.id} value={node.id}>{NODE_META[node.nodeType].label} · {node.title}</option>)}</select><select value={linkForm.relation} onChange={(event) => setLinkForm({ ...linkForm, relation: event.target.value })} className="input"><option value="supports">支持</option><option value="tests">验证</option><option value="produces">产出</option><option value="summarizes">总结</option><option value="contradicts">反驳</option></select><button className="btn btn-secondary" disabled={busy !== '' || !linkForm.sourceId || !linkForm.targetId}>{busy === 'edge' ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}连接</button></form><div className="research-map-edge-list">{edges.slice(0, 8).map((edge) => <div key={edge.id}><span>{nodesById[edge.sourceId]?.title || '已删除节点'}</span><ArrowRight size={11} /><b>{edge.relation}</b><ArrowRight size={11} /><span>{nodesById[edge.targetId]?.title || '已删除节点'}</span></div>)}{!edges.length && <p>还没有关系，先把一个假设连接到实验。</p>}</div></div>
        <div className="workbench-panel research-map-gaps"><div className="research-map-section-title"><div><CircleAlert size={15} /><h2>研究缺口</h2></div><span>Agent 复盘前先看这里</span></div>{gaps.length ? <div className="research-map-gap-list">{gaps.slice(0, 6).map((gap) => <button key={`${gap.kind}-${gap.nodeId}`} onClick={() => document.getElementById(`research-node-${gap.nodeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><CircleAlert size={13} /><span><b>{gap.title}</b><small>{gap.message}</small></span></button>)}</div> : <div className="research-map-all-good"><Check size={17} /><b>目前没有明显缺口</b><span>可以把精力放到下一轮实验或论文表达。</span></div>}</div>
      </section>

      <div className="task-flow-signature"><span /><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created by Deerflow</a><span /></div>
    </div>
  );
}

function ResearchMapLoading() { return <div className="mx-auto max-w-[1500px] space-y-4"><div className="h-32 animate-pulse rounded-[26px] bg-blue-50" /><div className="h-20 animate-pulse rounded-2xl bg-white" /><div className="h-[420px] animate-pulse rounded-2xl bg-white" /></div>; }

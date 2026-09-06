import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArchiveRestore, Cloud, Database, Download, FileClock,
  HeartPulse, Loader2, RefreshCw, ShieldCheck, Wrench,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ErrorState from '../../components/ErrorState';

const STATUS_COPY = {
  database: ['工作台数据库', 'SQLite 完整性与当前文件状态'],
  codex: ['本地 Codex Worker', '桌面 Agent 是否在主动连接'],
  backups: ['安全快照', '本机恢复目录与最近快照'],
};

export default function ConnectionHealth() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [health, setHealth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextHealth, nextBackups] = await Promise.all([api.getSystemHealth(), api.getRecoveryBackups()]);
      setHealth(nextHealth);
      setBackups(Array.isArray(nextBackups?.backups) ? nextBackups.backups : []);
      setError(null);
    } catch (err) {
      setError(err.message);
      toast.error('连接检查失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const createBackup = async () => {
    setBusy('backup');
    try {
      const result = await api.createRecoveryBackup();
      toast.success('安全快照已创建：' + result.name);
      await load();
    } catch (err) { toast.error('备份失败：' + err.message); }
    finally { setBusy(''); }
  };

  const downloadCurrent = async () => {
    setBusy('download');
    try {
      const response = await api.downloadBackup();
      if (!response.ok) throw new Error('下载失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'xiaojiu-workbench-' + new Date().toISOString().slice(0, 10) + '.db';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error('下载失败：' + err.message); }
    finally { setBusy(''); }
  };

  const restore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm('恢复前系统会自动创建当前数据库快照。确认使用“' + file.name + '”覆盖当前工作台吗？')) return;
    setBusy('restore');
    try {
      const result = await api.restoreRecoveryBackup(file);
      toast.success('恢复完成，恢复前快照为：' + result.preRestoreBackup.name);
      await load();
    } catch (err) { toast.error('恢复失败：' + err.message); }
    finally { setBusy(''); }
  };

  if (loading) return <HealthLoading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const cards = Object.keys(STATUS_COPY).map((key) => ({ key, ...STATUS_COPY[key], data: health?.[key] || {} }));
  const backupCount = health?.backups?.count || backups.length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
      <header className="relative overflow-hidden rounded-[26px] border border-emerald-100/80 bg-[#f8fffb] px-7 py-6 workbench-reveal">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-200/25 blur-3xl" />
        <div className="relative flex items-end justify-between gap-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-700/70"><HeartPulse size={13} /> WORKBENCH HEALTH</div>
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900">连接与恢复</h1>
            <p className="mt-1.5 text-sm text-slate-500">知道哪些连接在工作，也知道出问题时怎么安全回来。</p>
          </div>
          <button onClick={load} className="btn btn-secondary gap-1.5"><RefreshCw size={14} /> 一键检查</button>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3 workbench-reveal workbench-reveal-delay-1">
        {cards.map((card) => <HealthCard key={card.key} card={card} />)}
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)_390px] gap-5 workbench-reveal workbench-reveal-delay-2">
        <div className="workbench-panel p-6">
          <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-emerald-600" /><h2 className="text-base font-bold text-slate-800">安全快照</h2></div><p className="mt-1 text-xs leading-5 text-slate-400">恢复动作永远先保存当前数据库，不会让一次误操作变成不可逆损失。</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{backupCount} 个快照</span></div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <button onClick={createBackup} disabled={busy !== ''} className="flex flex-col items-start rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left hover:bg-emerald-50 disabled:opacity-50"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white">{busy === 'backup' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}</span><b className="mt-3 text-xs text-slate-700">创建安全快照</b><small className="mt-1 text-[10px] leading-4 text-slate-400">保存到本机恢复目录</small></button>
            <button onClick={downloadCurrent} disabled={busy !== ''} className="flex flex-col items-start rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-left hover:bg-blue-50 disabled:opacity-50"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500 text-white">{busy === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}</span><b className="mt-3 text-xs text-slate-700">下载到桌面</b><small className="mt-1 text-[10px] leading-4 text-slate-400">带日期的 .db 文件</small></button>
            <button onClick={() => fileRef.current?.click()} disabled={busy !== ''} className="flex flex-col items-start rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-left hover:bg-amber-50 disabled:opacity-50"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white">{busy === 'restore' ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />}</span><b className="mt-3 text-xs text-slate-700">恢复数据库</b><small className="mt-1 text-[10px] leading-4 text-slate-400">先校验，再自动留快照</small></button>
          </div>
          <input ref={fileRef} type="file" accept=".db,application/octet-stream" className="hidden" onChange={restore} />
        </div>

        <div className="workbench-panel p-6">
          <div className="flex items-center gap-2"><FileClock size={17} className="text-slate-600" /><h2 className="text-base font-bold text-slate-800">本机快照目录</h2></div>
          <p className="mt-1 text-xs leading-5 text-slate-400">只显示文件名和时间，不把本机绝对路径暴露到页面。</p>
          <div className="mt-4 max-h-52 space-y-2 overflow-y-auto">{backups.map((item) => <div key={item.name} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Database size={13} className="shrink-0 text-slate-400" /><div className="min-w-0 flex-1"><b className="block truncate text-[11px] text-slate-600">{item.name}</b><small className="text-[10px] text-slate-400">{formatBytes(item.size)} · {String(item.createdAt).slice(0, 16).replace('T', ' ')}</small></div><button onClick={() => api.downloadRecoveryBackup(item.name).catch((err) => toast.error(err.message))} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" title="下载快照"><Download size={13} /></button></div>)}{!backups.length && <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">还没有本机快照</div>}</div>
        </div>
      </section>

      <section className="workbench-panel p-6">
        <div className="flex items-center gap-2"><Wrench size={17} className="text-slate-600" /><h2 className="text-base font-bold text-slate-800">状态说明</h2></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs leading-5 text-slate-500"><p><b className="text-emerald-700">绿色</b>：数据库或本地 Codex 连接正常。</p><p><b className="text-amber-700">黄色</b>：尚未创建恢复快照，建议在重要改动前手动创建。</p><p><b className="text-red-700">红色</b>：数据库检查失败或本机 Worker 已离线。</p><p><b className="text-slate-700">数据库完整性</b>：恢复上传前会检查 SQLite 核心表和 integrity_check。</p></div>
      </section>

      <div className="task-flow-signature"><span /><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created by Deerflow</a><span /></div>
    </div>
  );
}

function HealthCard({ card }) {
  const data = card.data || {};
  const healthy = card.key === 'codex' ? data.online : card.key === 'backups' ? Number(data.count || 0) > 0 : data.connected;
  const status = healthy ? (card.key === 'backups' ? '已有快照' : '正常') : card.key === 'database' ? '异常' : card.key === 'backups' ? '尚未创建' : '未连接';
  const detail = card.key === 'codex' ? (data.latestJob?.status === 'failed' ? `最近任务失败：${data.latestJob.error || '请打开 Agent 重试'}` : (data.workers?.length ? data.workers.map((item) => item.worker_id).join('、') : '还没有 Worker 心跳')) :
    card.key === 'backups' ? (data.latest ? `最近：${data.latest.name}` : '还没有本机恢复快照') :
    (data.integrity || '等待检查');
  const Icon = card.key === 'database' ? Database : card.key === 'codex' ? Cloud : ShieldCheck;
  return <article className="workbench-panel p-5"><div className="flex items-start justify-between"><span className={'flex h-9 w-9 items-center justify-center rounded-xl ' + (healthy ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400')}><Icon size={16} /></span><span className={'flex items-center gap-1.5 text-[10px] font-semibold ' + (healthy ? 'text-emerald-700' : 'text-slate-400')}><span className={'h-2 w-2 rounded-full ' + (healthy ? 'bg-emerald-500' : 'bg-red-400')} />{status}</span></div><h3 className="mt-4 text-sm font-bold text-slate-700">{card[0]}</h3><p className="mt-1 text-[10px] leading-4 text-slate-400">{card[1]}</p><div className="mt-3 truncate text-xs text-slate-600">{detail}</div></article>;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function HealthLoading() {
  return <div className="mx-auto max-w-[1500px] space-y-4"><div className="h-36 animate-pulse rounded-[26px] bg-emerald-50" /><div className="grid grid-cols-3 gap-3">{[1, 2, 3].map((key) => <div key={key} className="h-36 animate-pulse rounded-2xl bg-white" />)}</div></div>;
}

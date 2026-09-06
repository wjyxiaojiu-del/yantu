import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, Check, CircleAlert, Copy, Laptop, Loader2, Minimize2,
  RefreshCw, RotateCcw, Send, Sparkles, X,
} from 'lucide-react';
import api from '../api';
import { useProject } from '../context/ProjectContext';

const ACTIVE_STATUSES = new Set(['queued', 'running']);
const STATUS_META = {
  queued: { label: '等待本机', className: 'bg-amber-50 text-amber-700' },
  running: { label: 'Codex 执行中', className: 'bg-blue-50 text-blue-700' },
  completed: { label: '已完成', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', className: 'bg-red-50 text-red-700' },
};

function summarizeCodexError(error) {
  const text = String(error || '未知错误');
  if (text.includes('401 Unauthorized') || text.includes('Invalid token')) {
    return 'Codex CLI 认证失败，请在本机 Codex 登录或检查自定义 Provider/API Key。';
  }
  if (text.includes('WinError 5')) return 'Windows 拒绝执行 Codex CLI，请重启本地 Worker。';
  return text.split(/\r?\n/).find((line) => line.trim() && !line.includes('WARN'))?.trim().slice(0, 500) || text.slice(0, 500);
}

export default function AIFloatingBubble() {
  const { projectId, projects } = useProject();
  const currentProject = projects.find((project) => project.id === projectId);
  const [open, setOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [input, setInput] = useState('');
  const [jobs, setJobs] = useState([]);
  const [workerStatus, setWorkerStatus] = useState({ online: false, workers: [] });
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [commandCopied, setCommandCopied] = useState(false);
  const endRef = useRef(null);

  const hasActiveJob = useMemo(() => jobs.some((job) => ACTIVE_STATUSES.has(job.status)), [jobs]);
  const onlineWorkers = workerStatus.workers?.filter((worker) => worker.online) || [];
  const workerCommand = `$env:CODEX_SERVER_URL = "${window.location.origin}"\n$env:CODEX_WORKER_TOKEN = "服务器配置的令牌"\n$env:CODEX_TENANT_ID = "${localStorage.getItem('tenant-id') || '1'}"\n$env:CODEX_WORKER_ID = "我的电脑"\npython tools/codex-worker.py`;

  const loadJobs = async () => {
    if (!projectId) return;
    try {
      const next = await api.getCodexJobs(projectId);
      setJobs(Array.isArray(next) ? next.slice(0, 12) : []);
    } catch {
      // The connection indicator communicates availability without noisy toasts.
    }
  };

  const loadWorkerStatus = async () => {
    try {
      setWorkerStatus(await api.getCodexWorkerStatus());
    } catch {
      setWorkerStatus({ online: false, workers: [] });
    }
  };

  useEffect(() => {
    setJobs([]);
    setInput('');
  }, [projectId]);

  useEffect(() => {
    if (!open) return undefined;
    loadJobs();
    loadWorkerStatus();
    const statusTimer = setInterval(() => {
      if (!document.hidden) loadWorkerStatus();
    }, 15000);
    return () => clearInterval(statusTimer);
  }, [open, projectId]);

  useEffect(() => {
    if (!open || !projectId || !hasActiveJob) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) loadJobs();
    }, 4000);
    return () => clearInterval(timer);
  }, [open, projectId, hasActiveJob]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [jobs, submitting]);

  const submit = async () => {
    const prompt = input.trim();
    if (!prompt || !projectId || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.createCodexJob({ projectId, prompt });
      setJobs((current) => [{ id: created.id, project_id: projectId, prompt, status: created.status || 'queued' }, ...current]);
      setInput('');
    } catch (error) {
      setJobs((current) => [{ id: `local-${Date.now()}`, prompt, status: 'failed', error: error.message || '提交失败' }, ...current]);
    } finally {
      setSubmitting(false);
    }
  };

  const retry = async (jobId) => {
    try {
      await api.retryCodexJob(jobId);
      setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status: 'queued', error: null, result: null } : job));
    } catch (error) {
      setJobs((current) => current.map((job) => job.id === jobId ? { ...job, error: error.message || '重新排队失败' } : job));
    }
  };

  const copyText = async (text, id) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const copyWorkerCommand = async () => {
    await navigator.clipboard.writeText(workerCommand);
    setCommandCopied(true);
    setTimeout(() => setCommandCopied(false), 1600);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="打开本地 Codex Agent"
          className="fixed bottom-6 right-6 z-[100] grid h-14 w-14 place-items-center rounded-full text-white transition hover:scale-105"
          style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-light))', boxShadow: '0 10px 32px var(--accent-300)' }}>
          <Sparkles size={22} />
        </button>
      )}

      {open && (
        <section className="fixed bottom-6 right-6 z-[100] flex h-[560px] w-[400px] flex-col overflow-hidden rounded-[22px] border border-white/80 bg-white/95 shadow-2xl backdrop-blur-2xl">
          <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white" style={{ background: 'var(--accent)' }}><Bot size={15} /></span>
              <div className="min-w-0">
                <strong className="block text-sm text-slate-700">本地 Codex Agent</strong>
                <button onClick={() => setConnectionOpen(true)} className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600">
                  <i className={`h-1.5 w-1.5 rounded-full ${workerStatus.online ? 'bg-emerald-500' : 'bg-red-400'}`} />
                  {workerStatus.online ? `已连接${onlineWorkers.length ? ` · ${onlineWorkers[0].worker_id}` : ''}` : '未连接 · 查看连接方法'}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { loadJobs(); loadWorkerStatus(); }} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="刷新 Codex 状态"><RefreshCw size={14} /></button>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="收起 Codex Agent"><Minimize2 size={14} /></button>
            </div>
          </header>

          <div className="border-b border-slate-100 px-4 py-2.5 text-[10px] text-slate-400">
            当前项目：<span className="font-semibold text-slate-600">{currentProject?.name || '未选择项目'}</span> · 只调用你电脑上的 Codex Worker
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!jobs.length && (
              <div className="flex h-full flex-col items-center justify-center px-7 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Sparkles size={24} /></span>
                <h2 className="mt-4 text-sm font-bold text-slate-700">让 Codex 检查当前科研链路</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">任务、文献、风险、每日记录与研究地图会作为当前项目上下文发送给本地 Worker。</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {['找出当前证据缺口', '给出今天的最小下一步', '复盘反复出现的不足'].map((prompt) => (
                    <button key={prompt} onClick={() => setInput(prompt)} className="rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-[10px] text-slate-500 hover:border-blue-100 hover:text-blue-600">{prompt}</button>
                  ))}
                </div>
              </div>
            )}

            {jobs.map((job) => {
              const meta = STATUS_META[job.status] || STATUS_META.queued;
              const copyValue = job.result || job.error || job.prompt;
              return (
                <article key={job.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`rounded-lg px-2 py-1 text-[9px] font-bold ${meta.className}`}>{meta.label}</span>
                    <span className="text-[9px] text-slate-300">#{job.id}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-700">{job.prompt}</p>
                  {ACTIVE_STATUSES.has(job.status) && <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400"><Loader2 size={11} className="animate-spin" />{job.status === 'running' ? '本机 Codex 正在处理' : '等待 Worker 领取'}</div>}
                  {job.result && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">{job.result}</div>}
                  {job.status === 'failed' && <div className="mt-3 flex gap-2 rounded-xl bg-red-50 p-3 text-[11px] leading-relaxed text-red-600"><CircleAlert size={13} className="mt-0.5 shrink-0" /><span>{summarizeCodexError(job.error)}</span></div>}
                  {(job.result || job.error) && (
                    <div className="mt-2 flex justify-end gap-1">
                      {job.status === 'failed' && typeof job.id === 'number' && <button onClick={() => retry(job.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] text-red-600 hover:bg-red-50"><RotateCcw size={10} />重新排队</button>}
                      <button onClick={() => copyText(copyValue, job.id)} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-50 hover:text-slate-500" aria-label="复制 Codex 结果">{copiedId === job.id ? <Check size={11} /> : <Copy size={11} />}</button>
                    </div>
                  )}
                </article>
              );
            })}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-slate-100 bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }}
                rows={2}
                className="input min-h-[58px] flex-1 resize-none text-xs leading-relaxed"
                placeholder={projectId ? '告诉本地 Codex 你要分析什么…' : '请先选择科研项目'}
                disabled={!projectId || submitting}
              />
              <button onClick={submit} disabled={!projectId || !input.trim() || submitting} className="grid h-[58px] w-12 place-items-center rounded-xl text-white disabled:opacity-40" style={{ background: 'var(--accent)' }} aria-label="提交给本地 Codex">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </footer>

          {connectionOpen && (
            <div className="absolute inset-0 z-20 overflow-y-auto bg-white/95 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-700">本地 Codex 连接</h2><button onClick={() => setConnectionOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"><X size={16} /></button></div>
              <div className={`mt-4 rounded-xl px-3 py-2.5 text-xs ${workerStatus.online ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {workerStatus.online ? `已连接：${onlineWorkers.map((worker) => worker.worker_id).join('、') || '本地 Worker'}` : '未检测到本地 Worker'}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">浏览器不会直接启动电脑程序。首次配置时在项目目录运行下面命令；以后使用桌面启动脚本即可自动打开工作台和 Worker。</p>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-200">{workerCommand}</pre>
              <button onClick={copyWorkerCommand} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs text-white" style={{ background: 'var(--accent)' }}><Laptop size={13} />{commandCopied ? '已复制命令' : '复制 Worker 启动命令'}</button>
              <button onClick={loadWorkerStatus} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs text-slate-600"><RefreshCw size={13} />重新检测</button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

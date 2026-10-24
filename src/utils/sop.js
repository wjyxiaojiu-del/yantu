// SOP 步骤进度与变量工具。
// 计数与父子勾选语义对齐 sop-workflow v1.1：无子步骤的顶层步骤计 1 项，
// 有子步骤的按子步骤计数；勾选父步骤同步全部子步骤，全部子步骤完成时父步骤自动完成。

export function countItems(steps) {
  let total = 0;
  for (const step of steps || []) {
    total += step.substeps?.length ? step.substeps.length : 1;
  }
  return total;
}

export function doneItems(steps) {
  let done = 0;
  for (const step of steps || []) {
    if (step.substeps?.length) done += step.substeps.filter(s => s.done).length;
    else if (step.done) done += 1;
  }
  return done;
}

export function toggleStep(steps, stepId, subId, value) {
  return (steps || []).map(step => {
    if (step.id !== stepId) return step;
    if (subId == null) {
      return {
        ...step,
        done: value,
        substeps: (step.substeps || []).map(s => ({ ...s, done: value })),
      };
    }
    const substeps = (step.substeps || []).map(s => (s.id === subId ? { ...s, done: value } : s));
    return { ...step, substeps, done: substeps.length > 0 && substeps.every(s => s.done) };
  });
}

const VAR_RE = /\{\{([^{}]+)\}\}/g;

export function extractVariables(steps) {
  const found = [];
  const scan = (text) => {
    if (!text) return;
    VAR_RE.lastIndex = 0;
    let m;
    while ((m = VAR_RE.exec(String(text)))) {
      const name = m[1].trim();
      if (name && !found.includes(name)) found.push(name);
    }
  };
  for (const step of steps || []) {
    scan(step.title);
    scan(step.note);
    (step.substeps || []).forEach(sub => scan(sub.title));
  }
  return found;
}

export function replaceVars(text, vars) {
  return String(text ?? '').replace(VAR_RE, (match, name) => {
    const key = name.trim();
    const value = vars?.[key];
    return value !== undefined && value !== '' ? String(value) : match;
  });
}

export function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

// sqlite datetime('now') 是 UTC 无时区字符串，补 Z 后才能正确转本地时间
export function parseSqliteTime(value) {
  if (!value) return null;
  return new Date(String(value).replace(' ', 'T') + 'Z');
}

export function liveElapsedMs(instance, now = Date.now()) {
  const base = instance.elapsed_ms || 0;
  const since = parseSqliteTime(instance.running_since);
  return base + (instance.status === 'running' && since ? Math.max(0, now - since.getTime()) : 0);
}

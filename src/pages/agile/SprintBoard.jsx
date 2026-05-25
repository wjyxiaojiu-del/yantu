import { useState, useEffect, useCallback } from 'react';
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Plus } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { SkeletonSpinner } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';

const COLUMNS = [
  { id: 'todo', label: '待办', wip: null, color: 'slate', emoji: '📋' },
  { id: 'this_sprint', label: '本周计划', wip: null, color: 'blue', emoji: '📅' },
  { id: 'in_progress', label: '进行中', wip: 3, color: 'amber', emoji: '⚡' },
  { id: 'verify', label: '待验收', wip: 2, color: 'purple', emoji: '👀' },
  { id: 'done', label: '已完成', wip: null, color: 'emerald', emoji: '✅' },
];

const colStyles = {
  slate: {
    bg: 'rgba(148, 163, 184, 0.03)',
    border: 'rgba(148, 163, 184, 0.2)',
    overBg: 'rgba(148, 163, 184, 0.06)',
    overBorder: 'rgba(148, 163, 184, 0.4)',
    headerBg: 'rgba(148, 163, 184, 0.06)',
  },
  blue: {
    bg: 'rgba(59, 130, 246, 0.02)',
    border: 'rgba(59, 130, 246, 0.15)',
    overBg: 'rgba(59, 130, 246, 0.06)',
    overBorder: 'rgba(59, 130, 246, 0.4)',
    headerBg: 'rgba(59, 130, 246, 0.05)',
  },
  amber: {
    bg: 'rgba(245, 158, 11, 0.02)',
    border: 'rgba(245, 158, 11, 0.15)',
    overBg: 'rgba(245, 158, 11, 0.06)',
    overBorder: 'rgba(245, 158, 11, 0.4)',
    headerBg: 'rgba(245, 158, 11, 0.05)',
  },
  purple: {
    bg: 'rgba(168, 85, 247, 0.02)',
    border: 'rgba(168, 85, 247, 0.15)',
    overBg: 'rgba(168, 85, 247, 0.06)',
    overBorder: 'rgba(168, 85, 247, 0.4)',
    headerBg: 'rgba(168, 85, 247, 0.05)',
  },
  emerald: {
    bg: 'rgba(16, 185, 129, 0.02)',
    border: 'rgba(16, 185, 129, 0.15)',
    overBg: 'rgba(16, 185, 129, 0.06)',
    overBorder: 'rgba(16, 185, 129, 0.4)',
    headerBg: 'rgba(16, 185, 129, 0.05)',
  },
};

export default function SprintBoard() {
  const { projectId } = useProject();
  const toast = useToast();
  const [sprints, setSprints] = useState([]);
  const [currentSprint, setCurrentSprint] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = async () => {
    try {
      const s = await api.getSprints({ project_id: projectId });
      setSprints(s);
      if (s.length) {
        const active = s.find(sp => sp.status === 'active') || s[0];
        setCurrentSprint(active);
      }
      setError(null);
    } catch (e) {
      setError(e.message);
      toast.error('加载迭代数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  useEffect(() => {
    if (currentSprint) {
      api.getTasks({ sprint_id: currentSprint.id }).then(setTasks).catch(() => {});
    }
  }, [currentSprint]);

  const getTasksByColumn = useCallback((colId) => {
    return tasks.filter(t => t.status === colId).sort((a, b) => a.sort_order - b.sort_order);
  }, [tasks]);

  const handleDragStart = (event) => setActiveId(event.active.id);

  const handleDragEnd = async (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find(t => String(t.id) === String(active.id));
    if (!activeTask) return;

    let newStatus = activeTask.status;
    const overTask = tasks.find(t => String(t.id) === String(over.id));
    if (overTask) newStatus = overTask.status;
    else { const col = COLUMNS.find(c => c.id === String(over.id)); if (col) newStatus = col.id; }

    if (newStatus !== activeTask.status) {
      const wipCol = COLUMNS.find(c => c.id === newStatus);
      if (wipCol?.wip) {
        const count = tasks.filter(t => t.status === newStatus).length;
        if (count >= wipCol.wip) {
          toast.error(`「${wipCol.label}」最多容纳 ${wipCol.wip} 个任务`);
          return;
        }
      }
      setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: newStatus } : t));
      try {
        await api.updateTask(activeTask.id, { status: newStatus });
        const colLabel = COLUMNS.find(c => c.id === newStatus)?.label || newStatus;
        toast.success(`任务已移至「${colLabel}」`);
      } catch (e) {
        setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: activeTask.status } : t));
        toast.error('更新失败，请重试');
      }
    }
  };

  const activeTask = tasks.find(t => String(t.id) === String(activeId));

  if (loading) return <SkeletonSpinner />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">任务看板</h1>
          <p className="text-sm text-slate-400 mt-1">拖拽任务卡片以更新状态</p>
        </div>
        <select value={currentSprint?.id || ''} onChange={e => setCurrentSprint(sprints.find(s => s.id === +e.target.value))} className="select w-52">
          {sprints.map(s => <option key={s.id} value={s.id}>S{s.number}：{s.name.replace(/Sprint \d+：/, '')}</option>)}
        </select>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-5 gap-3 min-h-[65vh]" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
          {COLUMNS.map((col, i) => (
            <KanbanColumn key={col.id} column={col} tasks={getTasksByColumn(col.id)} delay={i} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanColumn({ column, tasks, delay }) {
  const { setNodeRef, isOver } = useSortable({ id: column.id, data: { type: 'column' } });
  const c = colStyles[column.color];

  return (
    <div
      ref={setNodeRef}
      className="kanban-col"
      style={{
        background: isOver ? c.overBg : c.bg,
        border: `2px ${isOver ? 'solid' : 'dashed'} ${isOver ? c.overBorder : c.border}`,
        animation: `slideUp .5s var(--spring-bounce) ${delay * 0.06}s both`,
        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <div className="px-4 py-3 flex items-center justify-between rounded-t-xl" style={{ background: c.headerBg }}>
        <div className="flex items-center gap-2">
          <span className="text-base">{column.emoji}</span>
          <span className="text-xs font-semibold text-slate-600">{column.label}</span>
          <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(226,232,240,0.4)' }}>
            {tasks.length}
          </span>
        </div>
        {column.wip && <span className="text-[10px] font-medium text-slate-300 px-1.5 py-0.5 rounded-md"
          style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(226,232,240,0.3)' }}>
          WIP {column.wip}
        </span>}
      </div>
      <div className="flex-1 px-2.5 pb-2.5 space-y-2 overflow-y-auto scrollbar-hide">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task, i) => <SortableTaskCard key={task.id} task={task} index={i} />)}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableTaskCard({ task, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { type: 'task' } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={{ ...style, animation: `slideUp .35s var(--spring-bounce) ${index * 40}ms both` }} {...attributes} {...listeners}>
      <TaskCard task={task} />
    </div>
  );
}

function TaskCard({ task, isDragging }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const priorityBorders = {
    S: 'linear-gradient(180deg, #ef4444, #f87171)',
    A: `linear-gradient(180deg, ${c.accent}, ${c.accentLight})`,
    B: 'linear-gradient(180deg, #f59e0b, #fbbf24)',
    C: 'linear-gradient(180deg, #3b82f6, #60a5fa)',
    D: 'linear-gradient(180deg, #10b981, #34d399)',
  };
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <div className={`task-card ${isDragging ? 'dragging' : ''}`}
      style={{ borderLeft: `3px solid transparent`, borderImage: `${priorityBorders[task.priority] || priorityBorders.D} 1`, cursor: 'grab' }}>
      <p className="text-[13px] font-medium text-slate-800 leading-snug">{task.title}</p>
      {task.story_title && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 truncate max-w-[140px]">📋 {task.story_title}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5">
          {task.priority && <span className={`badge text-[10px] py-0 badge-${task.priority.toLowerCase()}`}>{task.priority}</span>}
          {task.story_points && <span className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded">{task.story_points}pt</span>}
        </div>
        {task.due_date && (
          <span className={`flex items-center gap-1 text-[10px] font-medium ${isOverdue ? 'text-red-500' : 'text-slate-300'}`}>
            <Calendar size={10} />{task.due_date.slice(5)}
          </span>
        )}
      </div>
    </div>
  );
}

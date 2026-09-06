import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';
import { useTenant } from './TenantContext';

const ProjectContext = createContext({
  projectId: null,
  projects: [],
  selectProject: () => {},
  createProject: async () => null,
  updateProject: async () => null,
  deleteProject: async () => null,
});

export function ProjectProvider({ children }) {
  const { currentTenant } = useTenant();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tid = currentTenant?.id;
    if (!tid) {
      setProjects([]);
      setProjectId(null);
      return;
    }

    let active = true;
    setLoading(true);
    console.log(`[ProjectContext] Fetching projects for tenant: ${tid}`);
    api.getProjects()
      .then(items => {
        if (!active) return;
        const nextProjects = Array.isArray(items) ? items : [];
        console.log(`[ProjectContext] Loaded projects:`, nextProjects);
        const savedId = Number(localStorage.getItem(`project-id:${tid}`));
        const selected = nextProjects.find(project => project.id === savedId) || nextProjects[0] || null;
        setProjects(nextProjects);
        setProjectId(selected?.id || null);
        if (selected) {
          localStorage.setItem(`project-id:${tid}`, String(selected.id));
        }
      })
      .catch((err) => {
        console.error('[ProjectContext] Failed to load projects:', err);
        if (!active) return;
        setProjects([]);
        setProjectId(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [currentTenant?.id]);

  const selectProject = (id) => {
    const pid = Number(id);
    const next = projects.find(project => project.id === pid);
    const tid = currentTenant?.id;
    if (!next || !tid) return;
    setProjectId(next.id);
    localStorage.setItem(`project-id:${tid}`, String(next.id));
  };

  const createProject = async (data) => {
    const tid = currentTenant?.id;
    if (!tid) throw new Error('未选择有效的工作区');
    const project = await api.createProject(data);
    setProjects(prev => [...prev, project]);
    setProjectId(project.id);
    localStorage.setItem(`project-id:${tid}`, String(project.id));
    return project;
  };

  const updateProject = async (id, data) => {
    const project = await api.updateProject(id, data);
    setProjects(current => current.map(item => item.id === project.id ? project : item));
    return project;
  };

  const deleteProject = async (id) => {
    const pid = Number(id);
    const tid = currentTenant?.id;
    if (!tid) throw new Error('未选择有效的工作区');
    await api.deleteProject(pid);
    setProjects(current => {
      const nextProjects = current.filter(project => project.id !== pid);
      const next = nextProjects[0] || null;
      setProjectId(next?.id || null);
      if (next) localStorage.setItem(`project-id:${tid}`, String(next.id));
      else localStorage.removeItem(`project-id:${tid}`);
      return nextProjects;
    });
  };

  if (currentTenant?.id && loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-slate-400">加载项目...</div>;
  }

  return (
    <ProjectContext.Provider value={{ projectId, projects, selectProject, createProject, updateProject, deleteProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}

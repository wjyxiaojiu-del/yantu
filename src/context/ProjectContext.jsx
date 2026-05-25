import { createContext, useContext } from 'react';

const ProjectContext = createContext({ projectId: 1 });

export function ProjectProvider({ children }) {
  return (
    <ProjectContext.Provider value={{ projectId: 1 }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}

// The projects the new-order form offers: loaded once, then filtered by the client picked.
import { useEffect, useState } from 'react';
import type { ProjectSummary } from '../../../shared/projects';
import { fetchProjects } from './api';

/** Every project, loaded once. Without them the form still works: the order just goes in no project. */
export function usePickerProjects(): ProjectSummary[] {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  useEffect(() => {
    let alive = true;
    fetchProjects().then((list) => { if (alive) setProjects(list); }, () => undefined);
    return () => { alive = false; };
  }, []);
  return projects;
}

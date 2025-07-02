import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useProjects, useProjectActions, useUIActions } from '../store';

export function ProjectList() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const queryClient = useQueryClient();

  const projects = useProjects();
  const { setProjects, addProject } = useProjectActions();
  const { addNotification } = useUIActions();

  const { data: fetchedProjects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
  });

  const { data: adapters } = useQuery({
    queryKey: ['adapters'],
    queryFn: api.getAdapters,
  });

  // Sync fetched projects with store
  useEffect(() => {
    if (fetchedProjects) {
      setProjects(fetchedProjects);
    }
  }, [fetchedProjects, setProjects]);

  const createProjectMutation = useMutation({
    mutationFn: api.createProject,
    onSuccess: newProject => {
      addProject(newProject as any);
      setShowCreateForm(false);
      addNotification({
        id: Math.random().toString(36).substr(2, 9),
        type: 'success',
        message: `Project "${(newProject as any).name}" created successfully!`,
        timestamp: new Date(),
      });
    },
    onError: error => {
      console.error('Failed to create project:', error);
      addNotification({
        id: Math.random().toString(36).substr(2, 9),
        type: 'error',
        message: 'Failed to create project. Please try again.',
        timestamp: new Date(),
      });
    },
  });

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='text-gray-500'>Loading projects...</div>
      </div>
    );
  }

  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
      <div className='flex justify-between items-center mb-8'>
        <h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
          Projects
        </h1>
        <button onClick={() => setShowCreateForm(true)} className='btn-primary'>
          New Project
        </button>
      </div>

      {projects?.length === 0 ? (
        <div className='text-center py-12'>
          <div className='text-gray-500 dark:text-gray-400'>
            No projects yet. Create your first project to get started.
          </div>
        </div>
      ) : (
        <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
          {projects?.map(project => (
            <div
              key={project.id}
              className='bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700'
            >
              <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-2'>
                {project.name}
              </h3>
              <p className='text-sm text-gray-500 dark:text-gray-400 mb-4'>
                {project.path}
              </p>
              <div className='flex justify-between items-center'>
                <span className='text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded'>
                  {project.activeAdapter}
                </span>
                <button
                  onClick={() =>
                    window.open(
                      `/terminal/new?projectId=${project.id}&adapter=${project.activeAdapter}`,
                      '_blank'
                    )
                  }
                  className='text-blue-600 hover:text-blue-700 text-sm font-medium'
                >
                  Open Terminal
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateForm && (
        <CreateProjectModal
          onClose={() => setShowCreateForm(false)}
          onSubmit={(data: any) => createProjectMutation.mutate(data)}
          adapters={(adapters as any) || []}
          isLoading={createProjectMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateProjectModal({
  onClose,
  onSubmit,
  adapters,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    path: string;
    activeAdapter: string;
  }) => void;
  adapters?: Array<{ name: string; description: string }>;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [activeAdapter, setActiveAdapter] = useState('claude-code');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !path.trim() || !activeAdapter) {
      alert('Please fill in all fields');
      return;
    }
    onSubmit({ name: name.trim(), path: path.trim(), activeAdapter });
  };

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center'>
      <div className='bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-md'>
        <h2 className='text-xl font-bold mb-4'>Create New Project</h2>
        <form onSubmit={handleSubmit}>
          <div className='mb-4'>
            <label className='block text-sm font-medium mb-2'>Name</label>
            <input
              type='text'
              value={name}
              onChange={e => setName(e.target.value)}
              className='input w-full'
              required
            />
          </div>
          <div className='mb-4'>
            <label className='block text-sm font-medium mb-2'>Path</label>
            <input
              type='text'
              value={path}
              onChange={e => setPath(e.target.value)}
              className='input w-full'
              placeholder='/path/to/your/project'
              required
            />
          </div>
          <div className='mb-6'>
            <label className='block text-sm font-medium mb-2'>AI Adapter</label>
            <select
              value={activeAdapter}
              onChange={e => setActiveAdapter(e.target.value)}
              className='input w-full'
              required
            >
              {adapters?.map(adapter => (
                <option key={adapter.name} value={adapter.name}>
                  {adapter.name} - {adapter.description}
                </option>
              )) || <option value='claude-code'>Claude Code</option>}
            </select>
          </div>
          <div className='flex justify-end space-x-3'>
            <button type='button' onClick={onClose} className='btn-secondary'>
              Cancel
            </button>
            <button type='submit' className='btn-primary' disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

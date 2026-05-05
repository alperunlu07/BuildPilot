import { useStore } from '../store/store';
import { PipelineEditor } from '../components/PipelineEditor';

interface Props {
  pipelineId: string;
}

export function PipelinePage({ pipelineId }: Props) {
  const pipeline = useStore((s) => s.pipelines.find((p) => p.id === pipelineId));
  const setView = useStore((s) => s.setView);

  if (!pipeline) {
    return (
      <div className="p-8 text-sm text-slate-500">
        Pipeline not found.{' '}
        <button
          type="button"
          className="text-sky-400 hover:underline"
          onClick={() => setView({ type: 'projects' })}
        >
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-2">
        <button
          type="button"
          onClick={() => setView({ type: 'project', id: pipeline.projectId })}
          className="text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300"
        >
          ← Project
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <PipelineEditor pipeline={pipeline} />
      </div>
    </div>
  );
}

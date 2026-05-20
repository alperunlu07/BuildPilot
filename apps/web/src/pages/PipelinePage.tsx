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
      <div className="p-8 text-sm text-text-muted">
        Pipeline not found.{' '}
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => setView({ type: 'projects' })}
        >
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base">
      <PipelineEditor pipeline={pipeline} />
    </div>
  );
}

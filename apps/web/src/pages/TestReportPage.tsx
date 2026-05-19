import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Download } from 'lucide-react';
import type {
  Build,
  BuildArtifact,
  TestReportKind,
  TestReportTree,
} from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';
import { TestReportTreeView } from '../components/TestReportTree';
import { CoverageReportPanel } from '../components/CoverageReportPanel';

// Cluster 11.F — full-page test report viewer reachable from the build
// detail "Tests" tab as well as direct deep-links (/builds/:id/tests).
// Pulls the parsed test tree, lets the user switch between xcresult and
// JUnit artifacts when both are present, and embeds the coverage panel
// underneath when a `coverage.xml` artifact exists.

const XCRESULT_RE = /\.xcresult\/?$/i;
const COVERAGE_RE = /(?:^|\/)(coverage|cobertura)[^/]*\.xml$/i;

interface Props {
  buildId: string;
}

function classify(path: string): 'xcresult' | 'junit' | null {
  if (XCRESULT_RE.test(path)) return 'xcresult';
  if (path.toLowerCase().endsWith('.xml') && !COVERAGE_RE.test(path)) return 'junit';
  return null;
}

export function TestReportPage({ buildId }: Props) {
  const setView = useStore((s) => s.setView);
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);

  const [build, setBuild] = useState<Build | null>(null);
  const [artifacts, setArtifacts] = useState<BuildArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<number | null>(null);
  const [report, setReport] = useState<TestReportTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([api.getBuild(buildId), api.getBuildArtifacts(buildId).catch(() => [])])
      .then(([b, arts]) => {
        if (!alive) return;
        setBuild(b);
        setArtifacts(arts);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [buildId]);

  // Pick the default artifact: prefer JUnit (.xml) over xcresult because
  // JUnit parses on any host. The user can flip via the selector.
  const testArtifacts = useMemo(
    () => artifacts.filter((a) => classify(a.path) !== null),
    [artifacts],
  );

  useEffect(() => {
    if (activeArtifactId !== null) return;
    if (testArtifacts.length === 0) {
      // No artifacts — still fetch so the server's note (e.g. "no
      // artifact recorded") is surfaced.
      api
        .testReport(buildId)
        .then((r) => setReport(r))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
      return;
    }
    // Prefer JUnit if present, otherwise first available.
    const junit = testArtifacts.find((a) => classify(a.path) === 'junit');
    setActiveArtifactId((junit ?? testArtifacts[0]!).id);
  }, [testArtifacts, activeArtifactId, buildId]);

  useEffect(() => {
    if (activeArtifactId === null) return;
    let alive = true;
    setLoading(true);
    setError(null);
    const art = artifacts.find((a) => a.id === activeArtifactId);
    const kind: TestReportKind | undefined = art ? (classify(art.path) ?? undefined) : undefined;
    api
      .testReport(buildId, { artifactId: activeArtifactId, ...(kind ? { kind } : {}) })
      .then((r) => {
        if (alive) setReport(r);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [buildId, activeArtifactId, artifacts]);

  const pipe = build ? pipelines.find((p) => p.id === build.pipelineId) : null;
  const proj = build ? projects.find((p) => p.id === build.projectId) : null;
  const hasCoverage = artifacts.some((a) => COVERAGE_RE.test(a.path));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-slate-800 bg-slate-900/40 px-3 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setView({ type: 'build', id: buildId })}
          className="focusable inline-flex items-center gap-1 rounded text-[11px] uppercase tracking-wider text-slate-400 hover:text-slate-300"
        >
          <ChevronLeft size={12} /> Back to build
        </button>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-lg font-semibold text-slate-100">Test report</h1>
          {pipe && (
            <span className="text-xs text-slate-400">
              {pipe.name}
              {proj && <> in <span className="text-slate-300">{proj.name}</span></>}
            </span>
          )}
          <span className="font-mono text-[11px] text-slate-500">{buildId.slice(0, 8)}</span>
        </div>
        {testArtifacts.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">Artifact:</span>
            <select
              value={activeArtifactId ?? ''}
              onChange={(e) => setActiveArtifactId(Number(e.target.value))}
              className="focusable rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            >
              {testArtifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {classify(a.path) === 'xcresult' ? '[xcresult]' : '[junit]'} {a.path.split('/').slice(-2).join('/')}
                </option>
              ))}
            </select>
          </div>
        )}
        {activeArtifactId !== null && (
          <a
            href={api.artifactDownloadUrl(activeArtifactId)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
            download
          >
            <Download size={11} /> Download raw artifact
          </a>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {error && (
          <div className="mb-3 rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
        {loading && !report ? (
          <div className="text-sm text-slate-400">Loading test report…</div>
        ) : report ? (
          <TestReportTreeView
            report={report}
            failuresOnly={failuresOnly}
            onFailuresOnlyChange={setFailuresOnly}
            filter={filter}
            onFilterChange={setFilter}
          />
        ) : (
          <div className="text-sm text-slate-400">No report data.</div>
        )}

        {hasCoverage && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Coverage</h2>
            <CoverageReportPanel buildId={buildId} />
          </div>
        )}
      </div>
    </div>
  );
}

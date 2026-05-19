import type { FastifyInstance } from 'fastify';
import type {
  Annotation,
  AnnotationLevel,
  AnnotationSource,
  AnnotationsReport,
} from '@buildpilot/shared-types';
import { getDb } from '../store/db';
import { getBuild } from '../store/builds';

// UI v2 Faz 6.B — annotations endpoint. Reads from the build_annotations
// table populated by per-step parsers (registered on the runner side as
// finalisers — xcodebuild log parser, swiftlint JSON, eslint JSON,
// gradle output). The table-first design means the endpoint stays a
// simple SELECT + sort even when a build has thousands of warnings.
//
// Parser registration is a follow-up: this PR ships the table + endpoint
// + UI tab so we have a working contract end-to-end; specific parsers
// land in dedicated PRs that can validate against real fixtures.

interface AnnotationRow {
  id: number;
  build_id: string;
  step_id: string | null;
  source: AnnotationSource;
  level: AnnotationLevel;
  file: string;
  line: number;
  column: number | null;
  message: string;
  rule_id: string | null;
  fingerprint: string | null;
  created_at: number;
}

export async function annotationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/builds/:id/annotations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) {
      reply.code(404);
      return { error: 'Build not found' };
    }
    const rows = getDb()
      .prepare(
        `SELECT id, build_id, step_id, source, level, file, line, column,
                message, rule_id, fingerprint, created_at
           FROM build_annotations
          WHERE build_id = ?
          ORDER BY file ASC, line ASC, column ASC, id ASC`,
      )
      .all(id) as AnnotationRow[];

    const annotations: Annotation[] = rows.map((r) => ({
      source: r.source,
      level: r.level,
      file: r.file,
      line: r.line,
      column: r.column ?? undefined,
      message: r.message,
      ruleId: r.rule_id ?? undefined,
      fingerprint: r.fingerprint ?? undefined,
    }));

    const report: AnnotationsReport = {
      stepId: null,
      totalCount: annotations.length,
      errorCount: annotations.filter((a) => a.level === 'error').length,
      warningCount: annotations.filter((a) => a.level === 'warning').length,
      infoCount: annotations.filter((a) => a.level === 'info').length,
      annotations,
      ...(annotations.length === 0
        ? {
            note:
              'No annotations yet. Add an xcodebuild / swiftlint / eslint / gradle step downstream of your build to capture warnings.',
          }
        : {}),
    };
    return report;
  });
}

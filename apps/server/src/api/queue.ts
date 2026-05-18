import type { FastifyInstance } from 'fastify';
import type {
  Build,
  QueueLaneSnapshot,
  QueueSnapshot,
} from '@buildpilot/shared-types';
import { listLanes } from '../store/lanes';
import { type BuildRow, rowToBuild } from '../store/builds';
import { getDb } from '../store/db';

// WP5 (queue): GET /api/queue → point-in-time view of running + pending
// builds grouped by lane. The UI polls this every few seconds (no SSE event
// type for it — keeps the wire surface small) and uses it to render the
// "Execution Queue" board.
export async function queueRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/queue', async () => {
    const lanes = listLanes();
    const db = getDb();

    // Running rows for a lane — FIFO by startedAt. Builds that the scheduler
    // has flipped from pending → running carry the timestamp of when they
    // started executing, so sorting by it puts oldest-running first.
    const runningStmt = db.prepare(
      `SELECT * FROM builds
       WHERE lane_id = ? AND status = 'running'
       ORDER BY started_at ASC`,
    );

    // Pending rows for a lane — priority first, then enqueue order. We LEFT
    // JOIN pipelines to read the *current* priority (the row may have been
    // re-prioritised after enqueue), but COALESCE keeps us safe when the
    // pipeline was deleted out from under a pending build (priority 100
    // matches the column default). Tied priorities fall back to FIFO via
    // started_at — matches the scheduler's own pick order in WP3.
    const pendingStmt = db.prepare(
      `SELECT b.* FROM builds b
       LEFT JOIN pipelines p ON p.id = b.pipeline_id
       WHERE b.lane_id = ? AND b.status = 'pending'
       ORDER BY COALESCE(p.priority, 100) ASC, b.started_at ASC`,
    );

    const result: QueueLaneSnapshot[] = lanes.map((lane) => {
      const runningRows = runningStmt.all(lane.id) as BuildRow[];
      const pendingRows = pendingStmt.all(lane.id) as BuildRow[];
      const running: Build[] = runningRows.map(rowToBuild);
      const pending: Build[] = pendingRows.map(rowToBuild);
      return { lane, running, pending };
    });

    const snapshot: QueueSnapshot = {
      lanes: result,
      generatedAt: Date.now(),
    };
    return snapshot;
  });
}

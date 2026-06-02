import { Notification } from 'electron';
import { join } from 'node:path';
import type { ServerEvent } from '@buildpilot/shared-types';
import { showWindow } from './window';

const ICON = join(__dirname, '..', 'build', 'icon.png');

function notify(title: string, body: string, route: string): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON, silent: false });
  // Clicking the OS toast brings the relevant page to the foreground.
  n.on('click', () => showWindow(route));
  n.show();
}

// Turn a server-side pipeline event into a native OS notification. Only the
// events a user actually cares about while the app sits in the tray raise a
// toast; the high-frequency stream (log lines, per-step churn) is ignored.
export function handlePipelineEvent(e: ServerEvent): void {
  switch (e.type) {
    case 'buildFinished': {
      const { status, id, triggerBranch } = e.build;
      // Only terminal outcomes raise a toast; the route + data are identical
      // across them, so a small lookup keeps it to one notify() call.
      const messages: Partial<Record<typeof status, { title: string; body: string }>> = {
        success: {
          title: 'Build succeeded ✓',
          body: `The build on ${triggerBranch} completed.`,
        },
        failed: {
          title: 'Build failed ✗',
          body: `The build on ${triggerBranch} errored.`,
        },
        cancelled: {
          title: 'Build cancelled',
          body: `Branch ${triggerBranch}.`,
        },
      };
      const msg = messages[status];
      if (msg) notify(msg.title, msg.body, `/builds/${id}`);
      return;
    }
    case 'buildAwaitingApproval': {
      notify(
        'Awaiting approval',
        'A build is waiting for your manual approval.',
        `/builds/${e.buildId}`,
      );
      return;
    }
    case 'notifyMatrix': {
      notify(
        'Matrix build finished',
        `${e.success}/${e.total} passed, ${e.failed} failed.`,
        `/builds/${e.parentBuildId}`,
      );
      return;
    }
    case 'newCommit': {
      const n = e.commits.length;
      notify(
        'New commit detected',
        `${n} new commit(s) landed on ${e.branch}.`,
        '/projects',
      );
      return;
    }
    default:
      // Everything else (logs, step churn, template/host edits) stays silent.
      return;
  }
}

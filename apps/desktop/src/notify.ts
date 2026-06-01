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
      if (status === 'success') {
        notify(
          'Derleme başarılı ✓',
          `${triggerBranch} dalındaki derleme tamamlandı.`,
          `/builds/${id}`,
        );
      } else if (status === 'failed') {
        notify(
          'Derleme başarısız ✗',
          `${triggerBranch} dalındaki derleme hata verdi.`,
          `/builds/${id}`,
        );
      } else if (status === 'cancelled') {
        notify('Derleme iptal edildi', `${triggerBranch} dalı.`, `/builds/${id}`);
      }
      return;
    }
    case 'buildAwaitingApproval': {
      notify(
        'Onay bekleniyor',
        'Bir derleme manuel onayınızı bekliyor.',
        `/builds/${e.buildId}`,
      );
      return;
    }
    case 'notifyMatrix': {
      notify(
        'Matris derlemesi tamamlandı',
        `${e.success}/${e.total} başarılı, ${e.failed} başarısız.`,
        `/builds/${e.parentBuildId}`,
      );
      return;
    }
    case 'newCommit': {
      const n = e.commits.length;
      notify(
        'Yeni commit algılandı',
        `${e.branch} dalına ${n} yeni commit geldi.`,
        '/projects',
      );
      return;
    }
    default:
      // Everything else (logs, step churn, template/host edits) stays silent.
      return;
  }
}

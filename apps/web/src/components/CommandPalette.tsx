import { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  GitBranch,
  History,
  Home as HomeIcon,
  HardDrive,
  Keyboard,
  Plus,
  Server,
  Settings as SettingsIcon,
  Sun,
} from 'lucide-react';
import { useStore } from '../store/store';

interface Props {
  onAddProject(): void;
  // Quick-add affordance: opens the legacy modal so an operator can add a
  // host without leaving the current view. The full management UI lives at
  // /hosts and is reachable via the "Go to SSH hosts" command.
  onManageHosts(): void;
}

export function CommandPalette({ onAddProject, onManageHosts }: Props) {
  const open = useStore((s) => s.paletteOpen);
  const close = useStore((s) => s.closePalette);
  const setView = useStore((s) => s.setView);
  const setProjectView = useStore((s) => s.setProjectView);
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const builds = useStore((s) => s.builds);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const recents = useStore((s) => s.recents);
  const openShortcutsHelp = useStore((s) => s.openShortcutsHelp);
  const triggerBuild = useStore((s) => s.triggerBuild);
  const { t } = useTranslation();

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const sortedBuilds = useMemo(() => builds.slice(0, 30), [builds]);

  if (!open) return null;

  function run(action: () => void): void {
    action();
    close();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      // Responsive overhaul follow-up — use dvh (dynamic viewport
      // height) so iOS Safari shrinks the top inset when the virtual
      // keyboard appears; otherwise the palette anchors to layout-vh
      // and the input + result list end up behind the keyboard.
      className="fixed inset-0 z-[90] flex items-start justify-center bg-bg-overlay px-3 pt-[8dvh] sm:pt-[12dvh]"
      onClick={close}
    >
      <div
        // Responsive overhaul Faz 2 — was full-width on phones with no
        // padding around it; now keeps a 12px gutter via the parent
        // px-3 and caps at max-w-xl above the px-3 inset.
        className="w-full max-w-xl max-h-[80dvh] overflow-hidden rounded-card border border-border-subtle bg-bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette" loop>
          <div className="border-b border-border-subtle px-3">
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={t('palette.placeholder')}
              className="w-full bg-transparent py-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2 text-sm">
            <Command.Empty className="px-3 py-6 text-center text-text-muted">
              {t('palette.empty')}
            </Command.Empty>

            {recents.length > 0 && !query && (
              <Command.Group heading={t('palette.sectionRecent')} className="cmdk-group">
                {recents.map((r) => {
                  const Icon = r.kind === 'project' ? Folder : r.kind === 'pipeline' ? GitBranch : History;
                  return (
                    <Command.Item
                      key={`recent-${r.kind}-${r.id}`}
                      value={`recent ${r.label}`}
                      onSelect={() => {
                        run(() => {
                          if (r.kind === 'project') setProjectView(r.id);
                          else if (r.kind === 'pipeline') setView({ type: 'pipeline', id: r.id });
                          else setView({ type: 'build', id: r.id });
                        });
                      }}
                      className="cmdk-item"
                    >
                      <Icon size={14} className="text-text-muted" />
                      <span className="truncate">{r.label}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            <Command.Group heading={t('palette.sectionActions')} className="cmdk-group">
              <Command.Item
                value="go home dashboard"
                onSelect={() => run(() => setView({ type: 'home' }))}
                className="cmdk-item"
              >
                <HomeIcon size={14} className="text-accent" /> {t('nav.home')}
              </Command.Item>
              <Command.Item
                value="go projects"
                onSelect={() => run(() => setView({ type: 'projects' }))}
                className="cmdk-item"
              >
                <Folder size={14} className="text-accent" /> {t('nav.projects')}
              </Command.Item>
              <Command.Item
                value="go builds logs"
                onSelect={() => run(() => setView({ type: 'builds' }))}
                className="cmdk-item"
              >
                <History size={14} className="text-amber-400" /> {t('nav.builds')}
              </Command.Item>
              <Command.Item
                value="go settings"
                onSelect={() => run(() => setView({ type: 'settings' }))}
                className="cmdk-item"
              >
                <SettingsIcon size={14} className="text-text-muted" /> {t('nav.settings')}
              </Command.Item>
              <Command.Item
                value="go disk usage"
                onSelect={() => run(() => setView({ type: 'diskUsage' }))}
                className="cmdk-item"
              >
                <HardDrive size={14} className="text-text-muted" /> {t('nav.diskUsage')}
              </Command.Item>
              <Command.Item
                value="add project new"
                onSelect={() => run(onAddProject)}
                className="cmdk-item"
              >
                <Plus size={14} className="text-emerald-400" /> {t('actions.addProject')}
              </Command.Item>
              <Command.Item
                value="go ssh hosts page"
                onSelect={() => run(() => setView({ type: 'hosts' }))}
                className="cmdk-item"
              >
                <Server size={14} className="text-text-muted" /> {t('nav.hosts')}
              </Command.Item>
              <Command.Item
                value="quick add ssh host"
                onSelect={() => run(onManageHosts)}
                className="cmdk-item"
              >
                <Plus size={14} className="text-text-muted" /> Quick-add SSH host
              </Command.Item>
              <Command.Item
                value="toggle theme"
                onSelect={() =>
                  run(() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'))
                }
                className="cmdk-item"
              >
                <Sun size={14} className="text-amber-300" /> {t('actions.toggleTheme')}
              </Command.Item>
              <Command.Item
                value="keyboard shortcuts help"
                onSelect={() => run(openShortcutsHelp)}
                className="cmdk-item"
              >
                <Keyboard size={14} className="text-text-muted" /> {t('actions.help')}
              </Command.Item>
            </Command.Group>

            {projects.length > 0 && (
              <Command.Group heading={t('palette.sectionProjects')} className="cmdk-group">
                {projects.map((p) => (
                  <Command.Item
                    key={`p-${p.id}`}
                    value={`project ${p.name} ${p.path}`}
                    onSelect={() => run(() => setProjectView(p.id))}
                    className="cmdk-item"
                  >
                    <Folder size={14} className="text-accent" />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto truncate text-[10px] text-text-muted">{p.path}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {pipelines.length > 0 && (
              <Command.Group heading={t('palette.sectionPipelines')} className="cmdk-group">
                {pipelines.map((pl) => {
                  const proj = projects.find((p) => p.id === pl.projectId);
                  return (
                    <Command.Item
                      key={`pl-${pl.id}`}
                      value={`pipeline ${pl.name} ${proj?.name ?? ''}`}
                      onSelect={() => run(() => setView({ type: 'pipeline', id: pl.id }))}
                      className="cmdk-item"
                    >
                      <GitBranch size={14} className="text-emerald-400" />
                      <span className="truncate">{pl.name}</span>
                      <span className="ml-auto truncate text-[10px] text-text-muted">
                        {proj?.name ?? ''}
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {pipelines.length > 0 && (
              <Command.Group heading={`${t('actions.runPipeline')}`} className="cmdk-group">
                {pipelines.map((pl) => (
                  <Command.Item
                    key={`run-${pl.id}`}
                    value={`run ${pl.name}`}
                    onSelect={() => {
                      run(() => {
                        void triggerBuild(pl.id);
                      });
                    }}
                    className="cmdk-item"
                  >
                    <GitBranch size={14} className="text-emerald-400" />
                    {t('actions.runPipeline')}: <span className="truncate">{pl.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {sortedBuilds.length > 0 && (
              <Command.Group heading={t('palette.sectionBuilds')} className="cmdk-group">
                {sortedBuilds.map((b) => {
                  const pl = pipelines.find((p) => p.id === b.pipelineId);
                  return (
                    <Command.Item
                      key={`b-${b.id}`}
                      value={`build ${b.id} ${pl?.name ?? ''} ${b.status}`}
                      onSelect={() => run(() => setView({ type: 'build', id: b.id }))}
                      className="cmdk-item"
                    >
                      <History size={14} className="text-amber-400" />
                      <span className="truncate">#{b.id.slice(0, 7)}</span>
                      <span className="ml-auto truncate text-[10px] text-text-muted">
                        {pl?.name ?? ''} · {b.status}
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

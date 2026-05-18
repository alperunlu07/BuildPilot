# BuildPilot UX Roadmap

A loose, cluster-organised tracker for upcoming UX work. Items are flipped to
`- [x]` once shipped and tagged with the short commit SHA that landed them.

## Cluster 10.D — Metrics-led home dashboard

The default landing view today is `ProjectsPage`. Cluster 10.D introduces a
metrics-first home view (running builds, success rate, recent failures,
slowest pipelines, disk usage) plus the supporting endpoints and a few
satellite widgets.

- [x] Home dashboard — new landing view with: running builds count, last-24h
      success rate, recent failures (last 5), slowest pipelines (top 5 by
      avg duration), disk usage summary. Add server endpoint
      `GET /api/metrics/home`. (d4f49d0)
- [x] Per-pipeline metrics panel — duration P50/P95 sparkline + step
      duration breakdown over last 30 builds. Endpoint
      `GET /api/metrics/pipeline/:id`. Render as a section on the home page
      or as a standalone component callable from the pipeline page. (da7f723)
- [x] Slowest-step leaderboard per pipeline — top 5 longest-running steps
      with average duration. Endpoint or computed in
      `/api/metrics/pipeline/:id`. (da7f723)
- [x] Disk usage page — bytes consumed by `~/.buildpilot/artifacts/` broken
      down by pipeline, with a "prune older than N days" action that reuses
      existing `pruneOldBuilds`. Endpoints `GET /api/metrics/disk-usage` +
      `POST /api/builds/prune?olderThanDays=N`. (44a047a)
- [x] Active builds widget — sticky element showing in-flight builds with
      progress + cancel button. Build a self-contained widget; integrate
      into App.tsx if possible (one line of import + render), otherwise
      return a "ready to integrate" component and note follow-up. *(commit TBD)*

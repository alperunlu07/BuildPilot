# BuildPilot UI v2 — Migration TODO

Bu doküman, `docs/designs/` altındaki prototipi (`index.html` + JSX + CSS dosyaları) mevcut `apps/web` uygulamasına entegre etmek için fazlı bir uygulama planıdır. Her faz **bağımsız commit edilebilir** ve sonunda **typecheck + browser smoke** ile doğrulanır.

---

## 0 · Lock-in Kararlar

Plana başlamadan önce kullanıcıyla uzlaşılan kararlar:

| # | Konu | Karar | Sonucu |
|---|---|---|---|
| D1 | Pipeline canvas engine | React Flow korunur | Edge creation/DnD/handle'lar yeniden yazılmaz; sadece custom node görseli + palette + property panel tasarıma göre yenilenir. |
| D2 | CSS ↔ Tailwind | Tailwind config CSS variable'larla beslenir | `tailwind.config.js`'e token map'i eklenir; mevcut utility kullanımı korunur; theme/density switch CSS root attribute üzerinden olur. |
| D3 | Queue & Priority | Korunur | Sidebar'a "Queue" item geri eklenir; Priority pipeline property panel'in Advanced tab'ında Lane'in yanına. |
| D4 | Light theme + density | Foundation'da hazırlık, polish fazında aktivasyon | `data-theme` + `data-density` root attr'leri ilk fazda kurulur; UI toggle'ı sona kalır. |

---

## Faz Genel Bakış

| Faz | Başlık | Tahmini |
|---|---|---|
| 1 | Foundation — design tokens, fontlar, theme infra | 1 PR |
| 2 | Primitives — Button, Badge, Card, Input, Tabs, vb. | 1 PR |
| 3 | Shell — sidebar, topbar, bottom log panel | 1 PR |
| 4 | Projects screen — grid/table toggle, sparkline | 1 PR |
| 5 | Pipeline editor — yeni node görseli + palette + property panel | 2 PR (görsel + property panel) |
| 6 | Build detail — 7 tab'lı yeni layout | 2 PR (tab shell + 3 yeni tab) |
| 7 | Builds list — table/timeline/heatmap view'lar | 1 PR |
| 8 | Step Catalog (YENİ) | 1 PR |
| 9 | SSH Hosts — modal'dan tam sayfaya | 1 PR |
| 10 | Settings refresh — 2-col layout, AI/Security section'lar | 1 PR |
| 11 | Queue + Priority reconciliation | 1 PR |
| 12 | Polish — light theme, density mode, accent picker, a11y | 1 PR |

Her PR'ın sonunda: `pnpm test` (tam suite, en az 525/525), `pnpm typecheck` (4 workspace), browser smoke.

---

## Faz 1 — Foundation: Design Tokens + Theme Infra

**Hedef:** Tasarımın token sistemi (CSS var'lar, fontlar, density, theme attribute'leri) hiçbir ekran kırılmadan altyapıya inilsin.

### Görevler

- **T1.1** — `apps/web/src/styles/tokens.css` (yeni dosya): `docs/designs/styles.css`'in `:root` ve `[data-theme="light"]` bloklarını port et. Sadece token tanımları, hiçbir component CSS'i yok.
- **T1.2** — `apps/web/index.html`: Google Fonts'tan Inter + JetBrains Mono preconnect + stylesheet linkleri ekle. Mevcut `body { font-family }` Inter'a güncellenir.
- **T1.3** — `apps/web/src/index.css`: `@import './styles/tokens.css';` en üste. Mevcut Tailwind directive'leri korunur.
- **T1.4** — `apps/web/tailwind.config.js`: `extend` boş olduğu için sıfırdan ekle:
  - `colors: { bg: { base: 'var(--bg-base)', canvas: 'var(--bg-canvas)', panel: 'var(--bg-panel)', elevated: 'var(--bg-elevated)', hover: 'var(--bg-hover)' }, border: { subtle: 'var(--border-subtle)', DEFAULT: 'var(--border-default)', emphasis: 'var(--border-emphasis)', strong: 'var(--border-strong)' }, text: { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)', muted: 'var(--text-muted)', faint: 'var(--text-faint)' }, accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)', glow: 'var(--accent-glow)', hover: 'var(--accent-hover)' }, status: { pending: 'var(--st-pending)', running: 'var(--st-running)', success: 'var(--st-success)', failed: 'var(--st-failed)', cancel: 'var(--st-cancel)', skipped: 'var(--st-skipped)' } }`
  - `fontFamily: { sans: ['Inter', 'Inter Variable', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'JetBrains Mono Variable', 'ui-monospace', 'monospace'] }`
  - `borderRadius: { btn: '6px', card: '8px', pill: '999px' }`
- **T1.5** — `apps/web/src/main.tsx` (veya `App.tsx`): root mount sırasında `document.documentElement.setAttribute('data-theme', 'dark')` + `data-density='comfortable'`. Accent runtime override yardımcısı: `setAccent(hex)` — `app.jsx:36-67`'deki mantığın TS portu, `apps/web/src/lib/theme.ts`'ye.
- **T1.6** — Mevcut tüm sayfalar test edilir; hiç görsel regression olmadığından emin olunur (sadece token altyapısı eklenmiş, kimse henüz kullanmıyor).

**Verification:** Browser açılır, mevcut tüm sayfalar (Projects, Queue, Settings, Pipeline Editor) görsel olarak değişmemiştir. Inter font yüklenip body'de görünür. `:root` CSS var'ları DevTools Computed'da listelenir.

**Risk:** Inter font yüklemesi sırasında FOIT — `font-display: swap` ile elimine.

---

## Faz 2 — Primitive Components

**Hedef:** Tüm ekranların paylaştığı atomik bileşenler oluşturulur. Her biri `apps/web/src/components/ui/` altında, tek dosya, named export.

### Görevler

- **T2.1** — `Button.tsx`: variant'lar (primary/secondary/ghost/danger), size'lar (sm/md/lg/icon), leftIcon/rightIcon, loading state. Tasarımda `.btn`, `.btn-primary` vb.
- **T2.2** — `Badge.tsx` (`.pill`): renk variant'ları (`success/failed/running/pending/accent/warn/neutral`), opsiyonel icon.
- **T2.3** — `StatusDot.tsx` (`.dot`): tek noktalı renkli circle; status enum'a göre.
- **T2.4** — `Card.tsx` (`.card`): default + interactive (hover) + nested header/footer.
- **T2.5** — `Input.tsx`, `Select.tsx`, `Switch.tsx`: form primitives. Tasarımdaki `.input`, `.field-select`, `.switch` stillerini al.
- **T2.6** — `Tabs.tsx` (`.prop-tab`): underline style, controlled, scrollable.
- **T2.7** — `FilterPill.tsx`: dropdown attached pill (Builds page filter'ları için).
- **T2.8** — `Kbd.tsx`: keyboard shortcut badge (`⌘K` vb.).
- **T2.9** — `Sparkline.tsx`: 30-bar SVG, status-renkli, hover tooltip.
- **T2.10** — Demo sayfa: `apps/web/src/pages/__primitives.tsx` (dev-only, build'e gitmez). Her primitive variant'ları yan yana — manual review için.

**Verification:** `__primitives` sayfası açılır, her bileşenin her variant'ı render olur. Theme dark/light arası geçiş (DevTools'tan `data-theme` toggle) düzgün çalışır.

**Önerilen ajan:** `frontend-design:frontend-design` skill'i — her primitive için tek seferde polish'li bir versiyon üretir.

---

## Faz 3 — Shell: Sidebar + Topbar + Bottom Log Panel

**Hedef:** Uygulama iskeleti tasarıma uygun hale gelir. Sayfalar henüz eski hâlinde — sadece çerçeve değişir.

### Görevler

- **T3.1** — `apps/web/src/components/shell/Sidebar.tsx` (mevcut `Sidebar.tsx`'i yeniden yaz). İçerik:
  - Üst: BuildPilot logo + brand text + version pill + cmdk ("Jump to..." `⌘K`).
  - Nav items: Builds & Logs (running count badge), SSH Hosts (count), Step Catalog (count 83), **Queue** (running+pending count), Vault (`SOON` disabled), Users & Access (`SOON` disabled), Settings.
  - Projects tree (collapsible) — her project altında pipeline list with status dot.
  - Footer: connection status dot + version + "?" hint.
  - Collapse mode (56px rail).
- **T3.2** — `apps/web/src/components/shell/Topbar.tsx` (yeni): breadcrumb (Projects > X > Y), current-view chips (pipeline/build cmdk), "N builds running" pill, notification icon, avatar.
- **T3.3** — `apps/web/src/components/shell/BottomLogPanel.tsx` (mevcut `BuildLogPanel.tsx`'in shell-level wrapper'ı): minimize/expand, sticky bottom, level filter toggle'ları.
- **T3.4** — `apps/web/src/components/shell/CommandPalette.tsx` (yeni, basit): `⌘K` ile açılır, projects/pipelines/builds arama, view jump. İlk versiyon basit — sadece keyboard nav + fuzzy match.
- **T3.5** — `apps/web/src/App.tsx`: yeni grid layout (`shell.css:6-11`'deki `app-grid` template'ini al). Sidebar+Topbar+Content+BottomPanel.

**Verification:** Sidebar collapse/expand çalışır. Project tree açılıp kapanır. `⌘K` palette açılır. Mevcut sayfaların içerikleri shell içinde doğru yerde render olur.

---

## Faz 4 — Projects Screen

**Hedef:** Mevcut Projects + ProjectDetail sayfaları tek sayfaya konsolide olur. Grid/Table toggle eklenir.

### Görevler

- **T4.1** — `apps/web/src/pages/ProjectsPage.tsx` yeniden yaz: `projects.jsx` referans. Grid view (cards) + Table view toggle (state-based, üst toolbar'da segmented control).
- **T4.2** — Project Card: sparkline (son 30 build), success rate %, avg duration, total builds, poller active dot, last build SHA.
- **T4.3** — Project Table: kolonlar Project / Branch / Last build / 30-day history (sparkline) / Path / Success%.
- **T4.4** — Sort dropdown: Recent / Name / Most builds.
- **T4.5** — `apps/web/src/pages/ProjectDetailPage.tsx`: KALDIR. Sidebar tree'den direkt pipeline'a gidiliyor zaten; ara sayfa gereksiz.
- **T4.6** — Store: `View.type === 'project'` kaldır. Tüm referansları temizle.
- **T4.7** — Project card / row tıklaması → sidebar tree'i o project altında genişlet + ilk pipeline'a otomatik git (veya project name'i sticky highlight'la, kullanıcı pipeline'ı seçsin).

**Verification:** Projects sayfası 3 proje gösterir. Grid ↔ Table geçişi temiz. Bir karta tıklayınca pipeline'a navigate olur. Sparkline doğru render olur.

---

## Faz 5 — Pipeline Editor Refresh

**Hedef:** En kritik ekran. React Flow korunur, görsel + sidebar + property panel tasarıma göre yenilenir.

### 5.A Görsel + Palette (1 PR)

- **T5.A.1** — Custom React Flow node component: `apps/web/src/components/pipeline/StepNode.tsx` yeniden yaz. Tasarımdaki `.pn-node`, `.pn-header` (kategori dot + icon + label), `.pn-footer` (status dot + duration), running animasyon bar.
- **T5.A.2** — Edge stilleri: bezier eğri, status renkli, animated dash for running.
- **T5.A.3** — Sol palette panel: `apps/web/src/components/pipeline/StepPalette.tsx` yeniden yaz. Categorized list (11 kategori), search, "Recently used" bölümü, "Recipes" (preset chains) bölümü. Drag-to-canvas mevcut React Flow API'siyle.
- **T5.A.4** — Validation overlay (`.canvas-validation`): floating sol-üst panel, çözülmemiş hatalar (örn. orphan node, cycle).
- **T5.A.5** — Minimap stilini güncelle (React Flow built-in component, sadece CSS).

### 5.B Header + Property Panel (1 PR)

- **T5.B.1** — Header strip: editable pipeline name, "saved" indicator, meta line (step count, edges, last built timing).
- **T5.B.2** — Watch chips strip: branch / interval / auto-trigger / Telegram approvals / rolling builds — her biri tıklanabilir chip; Triggers dropdown ile detay panel.
- **T5.B.3** — Triggers expanded panel: Branch / Tag / Cron / Paths / Webhook / API tab'ları.
- **T5.B.4** — `apps/web/src/components/pipeline/StepPropertyPanel.tsx` yeniden yaz. 3 tab: **Properties / Logs / Advanced**.
  - Properties tab: step-specific field'lar (mevcut tüm step type'lar için).
  - Logs tab: o node'un son N build'inin log'larını filter'lı göster.
  - **Advanced tab: Lane select + Priority input + AI Auto-Fix collapsible** (D3 kararı).

**Verification:** Pipeline editor açılır, mevcut tüm step type'ları render olur. Drag-drop palette → canvas çalışır. Property panel'in Advanced tab'ında Lane dropdown + Priority input görünür. Save → API PATCH atılır.

**Risk:** React Flow custom node + property panel arası state sync. Mevcut çalışan logic korunmalı.

---

## Faz 6 — Build Detail (7 Tab)

**Hedef:** Mevcut tek-panel build sayfası 7 sekmeli zengin bir görünüme dönüşür.

### 6.A Tab Shell + Mevcut Tab'lar (1 PR)

- **T6.A.1** — `apps/web/src/pages/BuildDetailPage.tsx` yeniden yaz: Tab nav komponenti (T2.6).
- **T6.A.2** — **Overview tab**: Gantt chart (mevcut `StepGantt.tsx`'i adapte et), live tail (top 10 log entries), Summary cards (Duration / Log lines / Artifacts / Builder), CommitCard, ArtifactsSummary.
- **T6.A.3** — **Logs tab**: level filter toggle'lar (system/info/stdout/stderr/success), regex search, "Jump to first error" button, virtualized list.
- **T6.A.4** — **Pipeline tab**: build anına ait pipeline snapshot (read-only canvas, T5.A node component'lerini kullan).

### 6.B Yeni Tab'lar (1 PR)

- **T6.B.1** — **Artifacts tab**: grid view, her artifact için Eye/Copy/Download aksiyonları, preview modal (image/log/json).
- **T6.B.2** — **Environment tab**: env değişkenleri (encrypted alanlar maskeli), SSH builder listesi (bu build hangi hostlarda çalıştı).
- **T6.B.3** — **Tests tab**: pass/fail/flaky sayıları, failed test detayları (stdout + stack trace). Test data nereden gelir — bu yeni bir backend kontratı; data.js'deki şemayı `shared-types`'a port etmek gerekebilir.
- **T6.B.4** — **Annotations tab**: derleyici warning'leri, lint hataları. Aynı backend kontratı sorusu.

**Verification:** Build sayfası 7 tab gösterir. Her tab içeriği yüklenir (Tests + Annotations data'sı yoksa "No data" placeholder).

**Risk:** Tests + Annotations backend kontratı yok. Backend tarafında step output parse + persist mekanizması gerekecek — ya tasarım için fake data ile başlanır ya da bu iki tab Faz 12'ye ertelenir.

---

## Faz 7 — Builds List (3 View Mode)

**Hedef:** Builds listesi tek tablo yerine table / timeline / heatmap üçlüsü.

- **T7.1** — Table view: yeni kolonlar (Status + Build# + Pipeline + Branch/SHA + Trigger + Duration + Started + Steps + Builder + Artifacts).
- **T7.2** — Filters: Status / Project / Trigger / Branch / Date range — her biri T2.7 FilterPill.
- **T7.3** — Timeline view: pipeline bazlı 24h gantt strip; her pipeline bir satır.
- **T7.4** — Heatmap view: 90-day GitHub-style grid (commit yoğunluğu gibi, success/failure renk yoğunluğu).
- **T7.5** — View toggle: segmented control üst toolbar'da.

**Verification:** 3 view de aynı filtre setiyle çalışır. Timeline + heatmap render performansı 1000+ build ile akıcı.

---

## Faz 8 — Step Catalog (YENİ EKRAN)

**Hedef:** Mevcutta olmayan sayfa. 83 step type'ının kataloğu + her birinin field'ları, sample JSON'ı.

- **T8.1** — `apps/web/src/pages/CatalogPage.tsx` (yeni). 2-col: grid (sol) + sticky detail panel (sağ).
- **T8.2** — Category chip filter bar üstte (11 kategori).
- **T8.3** — Grid cards: icon, category pill, label, type, description, "Used in N pipelines" stat, Insert button.
- **T8.4** — Detail panel: Fields tablo (key/type/required/encrypted), Sample JSON code block, "Insert into pipeline" CTA.
- **T8.5** — Veri kaynağı: `packages/step-registry` — registry'den tüm step type'lar + metadata. Eğer `description` veya `category` field'ları yoksa, registry'ye eklenir.
- **T8.6** — Insert CTA: pipeline editor'e geçerken seçilen step'i otomatik palette'te highlight'la, ya da direkt canvas'ın merkezine ekle.
- **T8.7** — `View.type === 'catalog'` ekle, sidebar item.

**Verification:** Catalog sayfası 83 step'i listeler. Filter + search çalışır. Detail panel field'ları doğru çeker. Insert → pipeline editor'e yönlendirir.

---

## Faz 9 — SSH Hosts (Modal → Full Page)

**Hedef:** Mevcut `HostsDialog` modal'ı tam sayfa SshHostsPage olur.

- **T9.1** — `apps/web/src/pages/SshHostsPage.tsx`. Layout: `1fr 380px`.
- **T9.2** — Host cards (sol): macOS version + arch + Xcode pills (capabilities), auth type badge, last ping / latency / N pipelines / 24h build count stats, "Test connection" button.
- **T9.3** — Detail panel (sağ, sticky): connection info, capabilities, 24h probe strip, "Used by" pipeline list, host fingerprint.
- **T9.4** — Modal (`HostsDialog.tsx`) kaldır; mevcut tüm referanslarını yeni sayfaya yönlendir.
- **T9.5** — Sidebar item zaten T3.1'de eklendi.

**Verification:** Hosts sayfası açılır, mevcut hostlar listelenir. Test connection butonu çalışır. Detail panel sticky.

---

## Faz 10 — Settings Refresh

**Hedef:** Settings tek-kolon liste'den 2-kolon (nav + content) layout'a geçer; yeni section'lar eklenir.

- **T10.1** — `apps/web/src/pages/SettingsPage.tsx` yeniden yaz. Sol 220px nav: General / Security / Notifications / Telegram / Webhooks / AI Integrations / Retention / **Lanes & Concurrency** / Vault (SOON) / Users & Access (SOON) / About.
- **T10.2** — Mevcut `LanesSection`'ı yeni 2-col yapıya port et — tasarım `settings.jsx:353-390`'daki tablo görünümü (Lane / Max / Active now / Trash).
- **T10.3** — AI Integrations section: claude/codex/aider/gemini path + version + model fields.
- **T10.4** — Security section: master key, encrypted fields tablosu, migration log.
- **T10.5** — Retention section: build retention days input (mevcut `pruneOldBuilds` backend'i).
- **T10.6** — About section: version, dependencies link, "No external connections" banner.
- **T10.7** — Vault + Users & Access section'ları: placeholder card "Coming soon" mesajı.

**Verification:** Settings nav switch yapar, içerik değişir. Lane CRUD çalışır (mevcut işlevsellik korunur). AI Integrations form save'i backend tarafında bir endpoint gerektirir — yoksa bu section "read-only display" olur.

---

## Faz 11 — Queue + Priority Reconciliation

**Hedef:** WP1-7'de yapılan queue feature tasarıma uyumlanır.

- **T11.1** — `apps/web/src/pages/QueuePage.tsx`: mevcut sayfayı yeni token'lar + primitive'lerle yeniden stille. Priority badge renk band'larını design palette'ine eşle.
- **T11.2** — Sidebar Queue item'ı (Faz 3'te eklendi): running+pending count badge.
- **T11.3** — Pipeline editor Advanced tab'ında Priority input (Faz 5'te eklendi) — design tarzında bir help tooltip ekle ("Lower runs first within the lane. Default 100.").
- **T11.4** — Builds list'te (Faz 7) "pending" status için filter chip + lane breakdown link → QueuePage.

**Verification:** Queue page yeni design'a uygun. Priority input pipeline editor'da görünür ve persist olur (zaten WP7'de doğrulandı).

---

## Faz 12 — Polish

**Hedef:** Theme/density UI, accent picker, a11y, animations, final QA.

- **T12.1** — Settings → General section'a Theme select (dark/light/system).
- **T12.2** — Settings → General section'a Density select (comfortable/compact).
- **T12.3** — Settings → General section'a Accent color picker (preset palette + custom hex).
- **T12.4** — Density "compact" modunda tüm tablo/satır spacing'lerinin çalıştığını doğrula. Comfortable → compact arası geçişte layout shift olmasın.
- **T12.5** — Light theme'de tüm ekranların testi; kontrast, hover state'ler, focus ring'ler.
- **T12.6** — Keyboard nav: Tab order tüm sayfalarda doğru, focus visible, `⌘K` her yerden açılır, modal/dialog Esc ile kapanır.
- **T12.7** — ARIA: nav landmark, sidebar `role="navigation"`, log panel `aria-live="polite"`.
- **T12.8** — Reduced-motion media query: pipeline node running bar + theme transition'lar respekt eder.
- **T12.9** — Final browser smoke: 7 ekran × 2 theme × 2 density = 28 kombinasyon screenshot. Görsel regression yok.

---

## Genel İş Akışı Notu

Her PR şu döngüden geçer:

1. **Plan** — `feature-dev:code-architect` ile detaylı uygulama planı.
2. **Implement** — `general-purpose` veya `frontend-design` skill.
3. **Verify** — `pnpm test` + `pnpm typecheck` + browser smoke (Chrome MCP).
4. **Review** — `feature-dev:code-reviewer` (opsiyonel ama önerilen).
5. **Commit** — tek conventional commit, `feat(ui-v2):` prefix'i.

PR sırası: 1 → 2 → 3 → ... Her PR önceki fazların tamamlanmasını bekler. Aynı fazın iç görevleri (örn. T2.1-T2.10) tek bir PR içinde ardışık yapılabilir.

---

## Bilinmeyen + Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| Tests + Annotations tab'larının backend kontratı yok | Faz 6.B'yi gerçekleştirmek için backend değişikliği gerekir | Faz 6.B'yi Faz 12'ye ertele; öncelikle fake data ile placeholder |
| AI Integrations section backend endpoint'i yok | Faz 10.T10.3 ya read-only ya da yeni endpoint | Yeni endpoint = ayrı WP, ya da display-only başla |
| Step registry'de description/category metadata eksik olabilir | Catalog page'i besleyecek veri yok | Faz 8.T8.5'de registry'yi extend et |
| Light theme'de hardcoded slate-* class'ları sorun çıkarır | Mevcut sayfalar light'ta bozulur | Her PR'da light theme'i de browser'da test et; Tailwind config CSS var'lara bağlı olduğu için çoğu sorun otomatik çözülür |
| `@xyflow/react` versiyon uyumsuzluğu node refactor sırasında | Pipeline editor kırılabilir | Faz 5 PR'ı en uzun süre review'da kalsın |

---

## Demir Atma

İlk PR'a başlamadan önce şu üç şey kararlı olmalı:

1. ✅ 4 kritik karar (D1-D4) — yukarıda lock'lu.
2. ⚠️ Tests + Annotations + AI Integrations için backend kontratlarının kapsama dışı olduğu netleştirildi (Faz 6.B ve 10.T10.3 placeholder).
3. ⚠️ Step registry metadata extension (`description`, `category`) — Faz 8 başlamadan önce backend tarafında yapılması gereken küçük bir iş.

Hazır olduğumuzda Faz 1'den başlayalım.

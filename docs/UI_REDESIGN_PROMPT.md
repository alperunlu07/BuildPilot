# BuildPilot — Ultra Detaylı UI/UX Yeniden Tasarım Promtu

> Bu doküman, BuildPilot'un mevcut görsel arayüzünü sıfırdan yeniden tasarlayacak bir AI ajanı (ör. Claude Code + `feature-dev` veya `frontend-design` skill) ya da insan tasarımcı için hazırlanmış, copy-paste edilebilir kapsamlı bir brief'tir. Ürünün **fonksiyonelliği değişmeyecek** — sadece görsel dil, etkileşim ve bilgi mimarisi yeniden kurgulanacak.

---

## 0 · TL;DR — Tasarımcıya Tek Cümlelik Misyon

> "BuildPilot, bir geliştiricinin masaüstünde çalışan, 83 step türlü görsel pipeline editörü + canlı build dashboard + cross-OS (Win/macOS/Linux/iOS/Android/Steam) CI/CD daemon'ıdır. Şu anki UI fonksiyonel ama 'iç araç' hissi veriyor. Linear + GitHub Actions + Bitrise'ın görsel kalitesini, n8n/Retool'un node editörü olgunluğunu ve Vercel/Railway'in dashboard zarafetini hedefleyen, profesyonel, bilgi-yoğun ama nefes alabilir, koyu-tema-öncelikli bir arayüz yarat."

---

## 1 · Proje Bağlamı (DEĞİŞTİRİLEMEZ Gerçekler)

### 1.1 Ürün Nedir?
- **BuildPilot**, geliştiricinin kendi makinesinde çalışan **lokal CI/CD daemon**'ıdır.
- Arka planda Fastify server (`http://127.0.0.1:51731`) + ön planda Vite-served web SPA (`:51732`) olarak iki süreçten oluşur.
- **Login YOK** (Phase 2.6.B'de LAN auth gelecek). Şu an `127.0.0.1`'e bağlı — single-user, single-machine model.
- Kullanıcı, **lokal git repo path'leri** kaydeder → BuildPilot bunları poll eder, yeni commit gelince toast / Telegram bildirimi atar → kullanıcı görsel pipeline editöründe DAG çizer → build başlatır → canlı log akar.

### 1.2 Hedef Kullanıcı Personaları
1. **Solo Indie Game Developer** (Unity dev) — Tek başına Windows + remote Mac mini'si var, iOS + Steam + Android'e aynı anda build atmak istiyor.
2. **5 Kişilik iOS Stüdyosu** (Phase 2.6'da gelecek) — Bitrise/Codemagic'in pahalılığından bunaldı, kendi makinelerinde, kendi Mac builder'larıyla çalışmak istiyor.
3. **DevOps Hobbyist** — GitHub Actions'ı tatmin edici bulmayan, görsel DAG editörüyle oynamak isteyen yarı-uzman geliştirici.

### 1.3 Mevcut Teknik Stack (DEĞİŞTİRME)
| Katman | Stack |
|---|---|
| Build engine | Node.js 20+ · TypeScript |
| Server | Fastify 5 · `better-sqlite3` · `simple-git` · `ssh2` · `pino` · `zod` |
| Web framework | **React 18.3** · **Vite 6** · **TypeScript 5.6** |
| Styling | **Tailwind CSS 3.4** (custom theme — palette aşağıda) |
| Graph editor | **`@xyflow/react` 12.3** (React Flow) |
| State | **Zustand 5** |
| Icons | **`lucide-react`** (mevcut yaklaşık 50 ikon — devam) |
| Tarih | **`date-fns` 4** |
| Sanal listeleme | **`react-window`** (log virtualization için kritik — 5000+ row) |
| Realtime | **Server-Sent Events** (`/events` endpoint) — WebSocket DEĞİL |
| Monorepo | pnpm workspaces (apps/{server,web} + packages/{shared-types,step-registry}) |

> ⚠ **Bu teknolojilerden çıkma.** Yeni bir framework (Next.js, Remix, SvelteKit) önerme. Yeni bir state manager (Redux, Jotai) önerme. shadcn/ui, Radix UI, Headless UI gibi component kütüphaneleri **eklenebilir** ama Tailwind-first yaklaşımdan ayrılma. Mevcut React Flow kurulu, onun yerine ReactFlow Pro ya da başka graph lib'i önerme.

### 1.4 Mevcut Bilgi Mimarisi (Ön Çalışmayı Anla, Sonra Yeniden Düşün)
```
┌─ Sidebar (272px)                ┌─ Main view (router-less, view state in Zustand)
│  • Logo + (+) Add project       │  • ProjectsPage          (grid of cards w/ sparklines)
│  • Builds & Logs                │  • ProjectDetailPage     (git graph + pipelines panel)
│  • SSH Hosts                    │  • PipelinePage          (React Flow editor)
│  • Settings                     │  • BuildsPage            (filterable table)
│  • Projects tree                │  • BuildDetailPage       (Gantt + log table + artifacts)
│    └─ pipelines (nested)        │  • SettingsPage          (Telegram config)
└──────────────────                ├─ BuildLogPanel          (sticky bottom, h=288px, live SSE)
                                   └─ ToastContainer         (top-right, new-commit prompts)
```
**Modallar/Dialoglar:** `AddProjectDialog`, `HostsDialog`, `CreatePipelineDialog`, `SaveTemplateDialog`, `ConfirmDialog`, `ArtifactPreviewModal`.

### 1.5 Domain Sözlüğü (Tasarımcı Bu Terimleri Bilmeli)
- **Project**: kaydedilmiş lokal git repo.
- **Pipeline**: bir projeye bağlı, DAG (yönlü asiklik graf) şeklinde adım dizisi. Her pipeline'ın bir `watch` config'i var (hangi branch'i ne sıklıkta poll edecek + tag/cron/path filtreleri).
- **Step / Node**: Pipeline'ın atomik birimi. 83 tür var, 14 kategoride toplanmış: Git, Build, Notifications, Artifacts & Upload, Remote, iOS Build/Signing/Distribute & ASC/Test (simctl)/Verify & Analyze/Versioning & Plist/Quality/Screenshots, Android, Steam.
- **Edge**: iki node arasındaki bağ. 3 koşul: `success` (yeşil), `failure` (gül), `always` (gri).
- **Build**: bir pipeline'ın çalıştırılmış instance'ı. Durumlar: `pending` · `running` · `success` · `failed` · `cancelled`.
- **BuildLogEntry**: timestamp + level (`system`/`info`/`stdout`/`stderr`/`success`/`failure`) + nodeId + stepType + message. 5000 satır in-memory cap.
- **NodeTemplate**: kullanıcının "preset" olarak kaydettiği bir step config'i; palette'e ek olarak görünür.
- **SshHost**: kaydedilmiş Mac builder kimliği (`~/.buildpilot/hosts.json`); kapasite badge'leri tutar (Xcode versiyonu, macOS, arch).
- **Watch**: pipeline'ın trigger config'i — `branch`, `intervalSec`, `autoTrigger` (`off`/`ask`/`pull`/`pullAndBuild`), `telegramApprovals`, `tagPattern`, `cronExpr`, `pathFilter`, `cancelInProgressOnNewCommit`.
- **AI Auto-Fix**: step başarısız olunca `claude`/`codex`/`aider`/`gemini` CLI çağırıp `maxRetries` kez retry.
- **continueOnError / retryPolicy / watchdog**: step seviyesinde dayanıklılık ayarları.
- **Artifact**: build sırasında toplanan dosyalar (`~/.buildpilot/artifacts/<buildId>/`). UI'da preview + download.

---

## 2 · Design System Temelleri (Sıfırdan Yeniden Yarat)

### 2.1 Marka Dili
- **İsim:** BuildPilot. **Etiket:** "Local-first CI/CD for cross-platform builders."
- **Ton:** Tekno-pragmatik. "Maker tarafından maker'lar için." Yumuşak değil — keskin, profesyonel, "bu bir araç" hissi. Animasyonlu, çocuksu illüstrasyonlar YOK.
- **Logo:** Basit, kod-okunabilir mark. Öneriler: stilize edilmiş bir uçak pusulası ('pilot') + bir branch grafiği ya da DAG node'ları. Tek renkli, hem ışık hem koyu arka planda çalışacak şekilde. SVG, max 32px'te okunaklı.

### 2.2 Renk Paleti
**Mevcut palette Slate-950 üzerine kurulu. Bu temel tonu koru ama daha bilinçli bir sisteme dönüştür.**

```css
/* Surface — koyu temada arka plan katmanları */
--bg-base:         #08090c   /* en arka — sayfa background */
--bg-canvas:       #0f172a   /* slate-900, panel iç yüzeyi (React Flow background) */
--bg-elevated:     #131a2a   /* card, dialog */
--bg-overlay:      rgba(10, 12, 20, 0.78)  /* modal scrim */

/* Borders */
--border-subtle:   #1e293b   /* slate-800 */
--border-default:  #334155   /* slate-700 */
--border-emphasis: #475569   /* slate-600 (hover, focus) */

/* Text */
--text-primary:    #f1f5f9   /* slate-100 */
--text-secondary:  #cbd5e1   /* slate-300 */
--text-muted:      #94a3b8   /* slate-400 */
--text-disabled:   #64748b   /* slate-500 */

/* Brand (Aksiyon) */
--brand-500:       #0ea5e9   /* sky-500 — primary CTA, link */
--brand-600:       #0284c7   /* hover */
--brand-glow:      rgba(14, 165, 233, 0.25)

/* Status — Build lifecycle */
--status-pending:  #64748b   /* slate */
--status-running:  #fbbf24   /* amber-400 — pulsing */
--status-success:  #34d399   /* emerald-400 */
--status-failed:   #fb7185   /* rose-400 */
--status-cancel:   #94a3b8   /* slate-400 */
--status-skipped:  #475569   /* dim */

/* Edge / Step kategori renkleri (StepDefinition.color) — koruyun ama dene-tut için tablolaştır */
git:           #0ea5e9     build:        #f59e0b     unity:        #a855f7
notifications: #ec4899     artifact:     #14b8a6     remote:       #6366f1
ios-build:     #3b82f6     ios-signing:  #f43f5e     ios-distrib:  #06b6d4
android:       #84cc16     steam:        #1b2838
```

**Light theme:** ŞU AN YOK. Yeni tasarımda **opsiyonel** olarak dahil et, ama default dark olsun. Light için aynı semantik token'lar farklı değerlerle. WCAG AA-AAA contrast oranlarını her iki temada da garanti et.

### 2.3 Tipografi
- **Sans (UI):** Inter Variable (tercih) — fallback `ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif`. Mevcut stack zaten bu sonuncusunu kullanıyor.
- **Mono (kod, sha, branch isimleri, log):** JetBrains Mono Variable veya Geist Mono — fallback `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. SHA'lar, branch isimleri, komutlar, log satırları, environment dosya yolları **daima** mono.
- **Skala (4-pt grid):**
  - `text-[10px]` — micro label/tag (uppercase tracking-wider)
  - `text-[11px]` — meta, breadcrumb, badge content
  - `text-xs (12px)` — secondary body, log
  - `text-sm (13–14px)` — body default
  - `text-base (16px)` — section heading
  - `text-lg (18px)` — page heading
  - `text-xl (20px)` — landing hero subtitle
  - `text-3xl/4xl/5xl` — landing hero, marketing only
- **Font-weights:** 400 (body), 500 (medium body/active state), 600 (heading), 700 (hero only). 900 KULLANMA.
- **Letter-spacing:** Uppercase mikrobaşlıklar her zaman `tracking-wider` (0.05em). Body için default.

### 2.4 Spacing & Layout
- 4-pt baz grid (Tailwind default).
- **Sayfa içi padding:** desktop `px-6 py-4` minimum, landing `px-8 py-12`.
- **Sidebar genişliği:** mevcut 272px (`w-72`) — yeni tasarımda **224–280px aralığında ayarlanabilir** + collapse-to-icon-rail (`w-14`) modu.
- **Bottom log panel:** mevcut sabit `h-72` (288px). Yeni: **dikey drag-resize** (180–60vh aralığı) + minimize-to-bar (h-9) modu.
- **Modal genişlikleri:** sm 480px · md 640px · lg 880px · xl 1120px.
- **Maksimum okuma genişliği:** body content `max-w-4xl` (Projects), tablo `max-w-6xl` (Builds), full-bleed editor (Pipeline).

### 2.5 Iconography
- `lucide-react` devam — tutarlılık için. Mevcut import seti `StepNode.tsx`'te (Apple, Box, GitBranch, GitMerge, Server, Apple, Steam yok—Gamepad2 ile temsil ediliyor vb.).
- **Boyut tutarlılığı:** sidebar item 14px · button içi 12–14px · step node 13px · page heading badge 16px · status dot 1.5×1.5.
- Custom platform icon'ları SVG olarak ekleyin (Steam logosu için resmi mark, Apple/Android için lucide-default, Unity için custom kübü).

### 2.6 Component Library (Yeniden Yazın — Mevcutlar Inline)
Şu component'leri **reusable + tipli + a11y-correct** olarak ayırın (mevcut kodda çoğu inline):

| Component | Variantlar | Notlar |
|---|---|---|
| `Button` | `primary` · `secondary` · `ghost` · `danger` · `link` + sizes `xs/sm/md` | Mevcut 5-6 farklı stil sınıfı tekrarlanıyor. Tek API'ye toplayın. Loading state spinner ile. |
| `IconButton` | aynı variantlar + square | Sidebar (+), card hover-actions için. |
| `Badge` / `Pill` | `neutral` · `success` · `running` (pulsing) · `failed` · `warning` · `info` · `outline` | Build status, branch chip, step duration, "unsaved" indicator. |
| `Input` / `Textarea` / `Select` | + `password` (reveal toggle) + `mono` variant + leading/trailing slot | Tek tip border (`border-slate-700`), `focus:border-sky-500`. Hata state'i kırmızı ring. |
| `Combobox` | branchSelect & hostSelect için tip-projeli | Searchable. Mevcut `BranchSelect.tsx` jenerikleştirilecek. |
| `Card` | `default` · `interactive` (hover-lift) · `dashed-empty` | Projects grid, pipeline rows, settings sections. |
| `Dialog` / `Modal` | `sm/md/lg` + scrollable body slot + sticky footer | ESC kapat, scrim click kapat (config'lenebilir), focus-trap. Radix Dialog veya Headless UI önerilebilir. |
| `Confirm` (destructive variant) | mevcut `ConfirmDialog` korunsun ama tipize | "Type X to confirm" varyantı eklenebilir. |
| `Toast` | `info` · `success` · `warning` · `error` · `commit-prompt` (eylem butonlu) | Mevcut `ToastContainer` korunsun ama sürelendirme + stack davranışı netleşsin. |
| `Tabs` | underlined + pill variant | StepPropertyPanel'deki Properties/Logs için. |
| `Tooltip` | hover + focus tetiklemeli | Mevcut HTML `title=` kullanıyor — accessibility için custom Tooltip. |
| `Sparkline` | mevcut `BuildSparkline` korunsun, smooth + hover-tooltip eklensin | |
| `KeyHint` | `<kbd>` styling | Komut palette, kısayollar. |
| `Skeleton` | shimmer animasyonu | Yükleme state'leri için (şu an "Loading…" plain text). |
| `EmptyState` | icon + heading + description + CTA | Projects 0, Pipelines 0, Builds 0, Logs 0 için tek pattern. |
| `Diff/CodePreview` | mono + line numbers | Artifact preview, future config diff. |

### 2.7 Animasyon İlkeleri
- **Süre:** 120–200ms ana etkileşim, 250–350ms enter/exit, 600ms+ ambient (pulsing running step, sparkline).
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo) UI için; linear sadece progress ve pulse için.
- **Reduced-motion:** `prefers-reduced-motion: reduce` saygı — pulse'ı statik yap, sayfa geçişleri instant.
- **Mevcut "running" pulse:** amber border + glow + ping. Koru ama daha sofistike yap — koyu temada glow `box-shadow: 0 0 0 2px rgba(251,191,36,.35), 0 0 24px rgba(251,191,36,.45)` zaten mevcut, doğru yönde.
- **React Flow edges:** `animated: true` zaten var (dashed flow) — koru.

### 2.8 Boş Durumlar, Hata Durumları, Yükleme
- **Boş Projects:** "No projects yet" + folder ikonu + `Add your first project` primary CTA + linki "Watch the 90s intro video" → kısa GIF.
- **Boş Pipelines (proje var, pipeline yok):** "Compose your first build" + starter graph thumbnail + `New pipeline` CTA + 3 hazır template ("Unity Linux dedicated server", "iOS TestFlight", "Steam Win64 upload").
- **Boş Builds:** "No builds match these filters" + "Clear filters" link.
- **Yükleme:** İlk render'da skeleton card'lar, sonraki yüklemelerde corner spinner. Asla full-screen blocking spinner kullanma.
- **Hata:** Inline banner (rose-950/40 bg + rose-300 text + `AlertCircle` ikonu) — toast değil. Toast geçicidir; data hatası kalıcı UI'ya gömülür.
- **Offline / Server down:** Sidebar logosunun altına kırmızı "Disconnected" pill + bottom log panel'in üstüne sticky banner "Reconnecting in 3s…".

### 2.9 Accessibility Şartları
- WCAG 2.1 AA minimum, AAA hedef koyu temada ana metin için.
- Tüm interaktif element keyboard reachable, görünür focus ring (sky-500 ring + offset).
- Tüm icon-only button'lar `aria-label` zorunlu.
- React Flow canvas için ayrı keyboard nav (Tab to focus, arrow tuşları ile node arası geçiş — `@xyflow/react`'in built-in `nodesFocusable`/`edgesFocusable` flag'leri).
- Renk tek başına anlam taşımasın — status pill'lerinde renk + ikon + metin (running ⏵ amber, success ✓ emerald, failed ✕ rose) üçlüsü.
- Screen reader'lar için SSE event'lerinde `aria-live="polite"` region (toast'lar ve "Build started" anonsları).

---

## 3 · EKRAN EKRAN SPESİFİKASYON

> Her ekran için: **Amaç · Kullanıcı görevleri · Layout · Component'ler · State'ler · Etkileşimler · Edge case'ler · Yeni iyileştirmeler**.

---

### 3.1 Landing Page (YENİ — Şu Anda Yok)

> **Bağlam:** BuildPilot şu an public bir landing page'e sahip değil — proje GitHub'da yaşıyor. Bu yeni surface, **`buildpilot.dev`** (veya benzer) için hazırlanacak. Hedef: GitHub README'sinden gelen ziyaretçileri "indir, dene" funnel'ına sokmak.

**Amaç:** 30 saniyede neyi neden çözdüğünü anlatmak; pnpm install komutunu copy-paste'e kadar getirmek.

**Bölümler (tek sayfa, scroll-driven):**

1. **Hero (yukarıdan-yukarı viewport)**
   - Sol: Headline `Local CI/CD for cross-platform builders.` Sub `Compose Unity, iOS, Android and Steam pipelines visually — run them on your own machine, your own Mac, your own time.`
   - Sağ: animasyonlu **Pipeline Editor showcase** — minik bir React Flow node grafiği (`checkout → pull → unityBatch → s3Upload`) düğümleri sırayla yeşil yanan, çalışan bir build simülasyonu (sahte ama gerçekçi). Auto-loop, hover'da durur.
   - CTA çifti: primary `Install` (pnpm komutu kopyalayan tek tıklı block), secondary `View on GitHub`.
   - Üstte minimal nav: logo · Docs · Pricing (yok, "Free & open-source" rozeti) · GitHub · Discord.

2. **Trust strip** — "83 step types · 14 categories · iOS · Android · Steam · Unity" rozetleriyle horizontal strip.

3. **Why local-first?** üç sütun:
   - **🔒 Your code never leaves your machine.** "No build minutes, no cloud queues, no leaked tokens."
   - **🍎 BYO Mac builder.** "Drive xcodebuild over SSH from any host. One Mac mini, many Windows devs."
   - **⚡ Self-healing pipelines.** "Claude / Codex / Aider auto-fix on step failure — retry on green."

4. **Anatomy of a pipeline** — interaktif scroll-storytelling:
   - Sol kolon yapışkan SVG/Lottie diagram (canvas üzerinde gezinen highlight ring), sağ kolon scroll-trigger metinler:
     - "Drag a step from the palette."
     - "Wire success and failure edges."
     - "Click any node, see its 30+ field configuration."
     - "Hit Run. Watch live logs stream in."

5. **Step library showcase** — 14 kategoriyi 14 etiketli kart olarak grid'le; kart hover'da o kategorideki step'leri içeren liste expand. (Bilgi yoğun ama hedef kitle developer — bunu sever.)

6. **Live build dashboard preview** — bir build'in detay sayfasının gerçek screenshot'ı (Gantt + log table + status pill'leri görünür). Hover'da Lightbox.

7. **Recipes** — 4 hazır pipeline recipe card'ı (Unity Linux server, iOS TestFlight, Android Play Store, Steam Win64). Her kart `Copy as JSON` butonu — kullanıcı yapıştırınca pipeline oluşur.

8. **Security note** — kısa bölüm: AES-256-GCM at-rest secret encryption, `~/.buildpilot/master.key`, "no telemetry, no auth-server, no cloud round-trip."

9. **Roadmap teaser** — Phase 2.6 cluster'larından (RBAC, file vault, build matrix, manual approvals, PWA push) görsel "Coming soon" şeridi.

10. **CTA banner + Footer** — `Install in 60s` + repo link + lisans (TBD) + Discord/Twitter/Bluesky.

**Tasarım notları:**
- Tamamen koyu tema. Light hero kesinlikle YOK — ürün ruhuyla çelişir.
- Hero'da subtle parallax (mouse-follow gradient blob veya 3D-grid). Performans için requestAnimationFrame'siz, CSS transform.
- Tüm code block'lar **gerçek BuildPilot output formatında** olsun (`enc:1:...`, `[stdout]`, `[success]` prefix'leri). Bu detaylar developer kitlesine güven verir.
- "View on GitHub" sayacı (stars) — Octokit fetch + ISR cache.
- Sayfa tek HTML, statik. **Astro** veya **Next.js Static** (eğer Next.js başlatılacaksa landing için ayrı bir `apps/landing` workspace) öner — ama mevcut Vite-React stack ile de yapılabilir, o zaman `apps/landing` ayrı bir Vite projesi.

**Edge case'ler:** Mobil görünüm — hero canvasını statik PNG'ye fallback et. Animasyonlu pipeline mobile'da kararlı olmaz, gizle.

---

### 3.2 Onboarding / First-Run Setup (YENİ)

> **Bağlam:** Şu an kullanıcı `pnpm dev` çalıştırıyor, tarayıcı açılıyor, boş Projects sayfası görünüyor. Bu sıçramayı yumuşatmak için **opsiyonel** ilk-çalıştırma wizard'ı.

**Tetikleyici:** SQLite'da `projects` tablosu boş ve `~/.buildpilot/onboarded.json` yok.

**Adımlar (modal, skippable):**
1. **Welcome** — "BuildPilot is running on `127.0.0.1:51731`. Logs live in `~/.buildpilot/`. Let's set up your first project."
2. **Add first project** — repo path picker (electron-style native dialog DEĞİL — sadece tip-to-search + recent paths). "Or paste an absolute path."
3. **Pick a starter template** — 3 kart: `Empty pipeline` · `Unity Linux dedicated server` · `Custom shell`.
4. **(opsiyonel) Configure remote Mac** — "Got an iPhone build to do later? Add your Mac builder now or skip."
5. **(opsiyonel) Telegram** — bot token + chat ID inputları, "Skip for now."
6. **Done** — "You're set. Press `?` anytime for shortcuts."

Tüm adımlar Esc ile skip edilebilir. Settings → Setup'tan tekrar açılabilir.

---

### 3.3 Global Application Shell

**Yapı:** 3 katmanlı.
- **Sol Sidebar** (resizable + collapsible) — Navigation + Projects/Pipelines tree.
- **Üst Topbar** (YENİ — şu an yok) — breadcrumb + global search + command palette tetikleyici + connection status + user menu (placeholder).
- **Ana içerik** (router-less view switcher, Zustand `view` state'i).
- **Alt Build Log Panel** (sticky, drag-resizable, minimize edilebilir).

#### 3.3.1 Sidebar Detayları
- **Genişlik:** default 256px. Drag-handle sağ kenarda (180–360px arası). Cmd+B ile collapse-to-rail (56px, sadece ikonlar + tooltip).
- **Üst kısım:** Logo + ürün adı + "Local CI/CD" caption + ⌘K (search palette) butonu.
- **Primary nav:**
  - `Builds & Logs` (history icon, amber accent)
  - `SSH Hosts` (server icon)
  - `Vault` (YENİ — Phase 2.6 file vault hazırlığı, ilk başta disabled w/ "Coming soon")
  - `Users & Access` (YENİ — RBAC hazırlığı, disabled tooltip)
  - `Settings`
- **Projects tree:**
  - Section header "PROJECTS" + sayım + `+` ikonu.
  - Her project: folder ikonu (sky-400) · isim · expand chevron.
  - Expand'de child pipelines: branch ikonu (renk = pipeline durumu — son build'in status renginde) · isim · hover'da Run/Clone/Delete mini-actions.
  - **YENİ**: project üstünde sağda mini status dot (poller aktif/inaktif) + son build durumu pill.
  - Drag-reorder (project listesi sıralı).
  - Right-click context menu: Open · Pull · Fetch · Configure watch · Remove.
- **Alt kısım:** versiyon (`v0.1.0`) · "Disconnected" badge (SSE bağlantısı koparsa) · "Toggle theme" (eğer light eklenirse) · `?` Shortcuts.

#### 3.3.2 Topbar (YENİ)
- Breadcrumb: `Projects / my-game / Linux dedicated server / Build #4f7a2b`.
- Center: Global `⌘K` command palette tetikleyici (placeholder input "Jump to project, pipeline, build, host, step…").
- Right: Connection LED (yeşil = SSE bağlı, amber = reconnecting, kırmızı = down). Yanında: aktif build sayacı badge ("2 builds running"). Yanında: bell (toast history). Yanında: user avatar (auth gelince anlamlı olacak — şu an "single user" placeholder).
- Background subtle `bg-slate-950/80 backdrop-blur`.

#### 3.3.3 Command Palette (YENİ — Kritik QoL)
- ⌘K / Ctrl+K aç. Fuzzy search üzerinde: projects, pipelines, builds, hosts, step types, settings sections, dokümantasyon linkleri.
- Kategoriler ayrılmış. ↑↓ ile gezin, Enter ile aç. ⌘Enter ile yeni tab'da.
- Eylemler: "New project…", "New pipeline in <project>…", "Run pipeline <name>", "Open build #XXX", "Toggle Telegram approvals on <pipeline>", "Configure SSH host <name>".

#### 3.3.4 Bottom Build Log Panel
- Sticky alt, default h-72 (288px). Drag handle ile yeniden boyutlandır.
- Minimize → 36px bar olarak kalır, içeriği: aktif build durumu + son satır preview.
- İçerik: header (status pill + build ID + commit sha + filtre toggle + Cancel/Download butonları) + `LogTable` (react-window virtualized).
- Yeni: **search/filter inline** (`Cmd+F` ile aç), **timestamp toggle** (relative vs absolute), **wrap toggle**.
- "Pop out" butonu — log paneli yeni tarayıcı penceresinde aç (developer'lar log monitör için bunu sever).

---

### 3.4 Projects Page (Yeniden Tasarım)

**Şu an:** dikey liste, her satırda folder ikonu + isim + path + branch chip + sparkline.

**Yeni:**

**Layout:** 12-col grid, cards 4-up @ desktop / 3-up @ md / 2-up @ sm / 1-up @ mobile.

**Header:**
- Sol: H1 "Projects" + count subtitle ("4 projects · 12 pipelines · 2 active builds")
- Sağ: `+ Add project` primary CTA + view-toggle (grid/table) + sort dropdown (Recent · Alphabetical · Most active · Largest repo)

**Card içeriği:**
- Üst: project ismi (H3) + ⋮ overflow menu (Open, Pull, Fetch, Configure, Remove)
- Path satırı (mono, truncated, copy-on-click tooltip)
- Mini badge'ler: default branch (mono pill), watched branch sayısı, last build SHA, last build status (renkli pill)
- **Sparkline genişletilmiş** — son 30 build, hover'da tooltip ("Build #4f, success, 4m 12s")
- Hover'da reveal: Pull · Fetch · Open detail butonları
- En altta mini stats row: Total builds · Avg duration · Success rate %

**Yan panel (opsiyonel)** — bir card'ı select edince sağdan açılan detay drawer: poller log'u, son commit'ler özet, hızlı "Run pipeline" dropdown.

**Filtreler/arama topbar:** "Filter projects… (path, branch, status)".

**Edge case'ler:**
- Path artık erişilemiyor (örnek: USB diski çıkarılmış) → card kırmızı dim + warning ikonu + "Path not found" tooltip + Re-link butonu.
- Git remote down → poller error gösterimi (amber border).

---

### 3.5 Project Detail Page

**Şu an:** üst header + branch strip + 2-col body (git commit graph SOL · pipelines panel SAĞ).

**Yeni Layout (geliştirilmiş):**

**Header (yapışkan):**
- Breadcrumb (sidebar/topbar'da değil, sayfa içinde de)
- H1 project ismi + ⋮ menu (Remove project, Edit display name)
- Path satırı (copy-on-click)
- Tab navigasyon: `Commits` · `Pipelines` · `Builds` · `Activity` · `Settings`

**Sticky branch toolbar (Commits tab'inde):**
- Sol: `on <currentBranch>` chip (mevcut yeşil dot pattern korunsun — güzel)
- Browse selector — combobox: (all branches) · all branches'in listesi
- "X commits since last build" amber-pill
- Sağ: `Fetch` · `Pull` butonları + son fetch zamanı ("fetched 4m ago")

**Commits liste (sol kolon, scrollable):**
- Mevcut `CommitItem` + `computeGraph` (multi-branch git graph render) korunsun ama:
  - Avatar / author renkli daire (Gravatar opsiyonel)
  - Commit subject line — daha okunaklı tipo
  - Body collapsible (kısa preview + ▾)
  - Sağ tarafta: branch ref pill'leri (`origin/main`, `HEAD`), tag pill'leri (`v1.4.2`)
  - SHA tıklayınca copy + tooltip
  - Hover'da "Build from this commit" butonu — pipeline picker modal aç.
  - Highlight: son başarılı build'den bu yana gelen commit'ler ambar-glow ile vurgu (mevcut yaklaşım korunsun).

**Pipelines panel (sağ kolon, sticky):**
- Üstte search + filter (active watch / passing / failing)
- Her pipeline card'ı (mevcut `PipelineRow`'un gelişmişi):
  - İsim + ChevronRight (open)
  - Status mini-strip: son 8 build'in durum noktaları (mini sparkline-of-dots)
  - Watch branch chip · interval chip · step sayısı chip · last built SHA chip
  - Eylem butonları: `Run` (primary) · `Schedule` (cron varsa highlight) · `Clone` · `Delete`
  - Eğer aktif build varsa: progress bar (running step adıyla) + Cancel butonu
- Üstte `+ New pipeline` butonu

**Activity tab (YENİ):**
- Cron/poller event timeline: "12:30 polled, no new commits" · "12:31 webhook received from GitHub, pipeline Linux dedicated server queued" · etc.
- Filter by source (poller / webhook / cron / manual).

**Settings tab (YENİ):**
- Project-level: display name, watched branches roster, default poll interval, auto-fetch on focus.

---

### 3.6 Pipeline Editor (En Önemli Ekran — En Çok Polish Hak Eden)

**Şu an:** Sol palette (208px) + ortada React Flow canvas + sağda 320px property panel + üstte 1 satır header.

**Yeni — 3 alanda ciddi geliştirme:**

#### 3.6.1 Header (Çok Daha Bilgilendirici)
- 2 satır:
  - Üst satır: breadcrumb · pipeline ismi inline-edit · `Saved`/`Unsaved`/`Saving…` indicator · Run/Cancel/Save/Delete actions
  - Alt satır: watch config'i bir compact bar olarak (mevcut yaklaşım) — branch combobox, interval, autoTrigger select (off/ask/pull/pullAndBuild), Telegram approvals toggle, Triggers expand button
- Triggers expand panel (mevcut korunsun, ama görsel olarak tablar halinde):
  - **Branch** (default poller)
  - **Tag pattern** (glob)
  - **Cron** (5-field + human-readable preview "Every weekday at 09:00 UTC" gibi)
  - **Path filter** (multiline glob list + "Test a sample path" textbox)
  - **Webhooks** (READ-ONLY display of `POST /api/webhooks/github/<id>` URL + Copy button + secret env var hint)
  - **Generic API** (`POST /api/triggers/<id>?token=…` + Copy curl)
  - **Rolling builds** toggle (cancelInProgressOnNewCommit)
- Header altında thin status strip: aktif build varsa progressi gösteren ince bar (gerçekten ince — 2px — gradient).

#### 3.6.2 Sol Palette (Geliştirilmiş)
- Search input üstte (mevcut)
- 14 kategori collapsible (mevcut). Her kategori header'da count + renk göstergesi (kategori color dot).
- Step item'ları kart yerine **draggable chip** stili: ikon + label + rengi border ile. Hover'da step description tooltip.
- Yeni: **"Recently used" pin section** üstte (son 5 step type).
- Yeni: **"Favorites" / starred** — kullanıcı sık kullandığı step'lere yıldız koyabilsin.
- **Custom templates** kategorisi en altta dashed border (mevcut). Template item'ında preview thumbnail (template'in canvas snapshot'ı küçük).
- **"Recipes" bölümü (YENİ)** — kullanıcının pipeline'a bir blok ekleyebileceği hazır gruplar: "iOS sign + upload bundle" → 5 node + 4 edge tek seferde drop.

#### 3.6.3 Canvas (React Flow)
- Mevcut `Background` (16px dot grid) ve `Controls` korunsun. Yeni:
  - **MiniMap** ekle (sağ alt) — büyük pipeline'larda kritik.
  - **Snap-to-grid** toggle (control panel'inde).
  - **Auto-layout** butonu — dagre veya elkjs ile hierarchical layout. Kullanıcı dağınık node'ları tek tuşla düzenler.
  - **Selection box** ile çoklu seçim → grup move/delete.
  - **Right-click on node:** mini context menu (Duplicate, Save as template, Run from here, Delete, Copy JSON).
  - **Right-click on canvas:** Add step (search palette mini).
  - **Edge stilleri:** mevcut renk paleti (success=emerald, failure=rose, always=slate) korunsun ama edge **kalınlığı** koşula göre küçük varyans (always biraz daha ince). Edge label'larında ikon (✓ ✕ ↻).
  - **Annotations / sticky notes** (YENİ) — kullanıcı canvasa post-it koyabilsin (markdown destekli).
  - **Lanes** (YENİ — Phase 4 hazırlığı): canvas arka planında dikey lane'ler (örn. "Test", "Build", "Deploy") — node'lar bu lane'lere snap.

#### 3.6.4 Sağ Property Panel
- **3 tab** (Properties / Logs / Advanced):
  - **Properties** — mevcut field render'ı + zorunluluk badge'leri + alanlar grup grup (ana fields, host fields collapsible, advanced fields collapsible).
    - Her field'in solunda küçük "?" → hover'da rich tooltip (help text + örnek).
    - `password`, `botToken`, `apiKey...` field'larında **reveal eye + lock badge** (encrypted at rest göstergesi).
    - `branchSelect` ve `hostSelect` field'ları custom Combobox component'iyle.
    - `textarea` field'larında satır sayacı + "expand to fullscreen" butonu.
  - **Logs** — bu node'un son build'deki output'u, LogTable virtualized (mevcut yaklaşım).
  - **Advanced** — `continueOnError` toggle, `retryPolicy` (enabled, maxRetries, backoffMs, backoffMaxMs), `watchdog` (enabled, idleSec), AI auto-fix block (tool select + prompt textarea + maxRetries).
- Üstte: step name badge + step type micro-label + duration (son run) + status pill.
- Eylem butonları: `Run from here` · `Save as template` · `Duplicate` · `Delete` (danger).
- Alt: collapsible "Step reference" — bu step type'ın PIPELINES.md'deki dokümanına link (in-app drawer'da render).

#### 3.6.5 Yeni özellikler (önemli)
- **Diff view** (Versioning — Phase 4 hazır) — pipeline'ı değiştirdikçe "View changes" butonu → side-by-side diff.
- **JSON view toggle** — sağ üstte "Edit as JSON" — pipeline'ın raw JSON'unu Monaco editor'de aç, kaydedince validate et.
- **Validation panel** — alt köşede mini panel: "2 errors, 1 warning" (eksik required field, isolated node, döngü vs.). Tıklayınca node'a fly-to.
- **Live run overlay** — Run sırasında canvas üzerinde semi-transparent overlay; her node'da real-time durum + duration timer (mevcut zaten var, daha cilala).
- **Replay mode** — geçmiş bir build'i seçince canvas o build'in step status'larını recreate eder ve "play" tuşuyla logları timeline boyunca scrub edebilirsin (n8n / Temporal'daki Workflow History deneyimi).

---

### 3.7 Step Catalog (YENİ — Standalone Sayfa)

> **Bağlam:** 83 step type doğru iş için doğru step'i bulmayı zorlaştırıyor. Pipeline editöründeki palette yeterli değil — keşfedilebilir bir browse sayfası gerekli.

**Sayfa: Sidebar → Step Catalog** veya **Settings → Steps**.

- Üstte 14 kategori chip'leri (filter)
- Search input
- Grid: her step için kart — ikon, isim, kategori renkli border, kısa description, kullanılan field sayısı, "Used in N pipelines" stats, "Documentation" link, "Add to favorites" yıldız.
- Tıklayınca detail drawer: full description, required/optional field'lar tablo, sample data JSON, "Insert into pipeline…" picker.

Bu sayfa pipeline editöründen `?` ile de tetiklenebilir.

---

### 3.8 Builds Page

**Şu an:** filterlı tablo (project / pipeline / status), tıklayınca detail'e gider.

**Yeni:**

**Header:**
- H1 + count subtitle ("142 builds · 23 today · 4 currently running")
- "Refresh" butonu (mevcut)
- View toggle: `Table` · `Timeline` · `Calendar heatmap` (Yeni — son 90 gün GitHub-style heatmap)

**Filters bar:**
- Project · Pipeline · Status (mevcut)
- + Yeni: Trigger type (manual / poller / cron / webhook / telegram) · Branch · Date range · Duration > X · Has artifacts · Tag pattern

**Table:**
- Mevcut sütunlar + ekleyin: Trigger source (icon: 🤖 poller, 👤 manual, ⏰ cron, 🔔 webhook, ✈ telegram), Step count, Artifact count, Resource (which SSH host or local), Cost estimate (YENİ — duration × hourly rate konfigürelendirilebilir).
- Status pill'leri mevcut palette korunsun.
- Sıralanabilir başlıklar.
- Row hover'da right-side action chip: View · Re-run · Cancel (running) · Download log · Copy permalink.
- **Bulk select** — Cmd+click ile çoklu seçim, üstte bulk action bar (Re-run, Delete, Tag).

**Sağ side drawer (build seçince):**
- Tıklayınca tam sayfaya değil, sağdan açılan 600px drawer → quick preview + "Open full view" linki.

**Timeline view:**
- Tüm build'leri zaman ekseninde swimlane (her pipeline ayrı satır), Gantt-style. Concurrent build'leri stack'li göster.

**Calendar heatmap:**
- 90 gün × günlük build sayısı; GitHub-contributions estetiği ama status renkli (yeşil=success-heavy gün, kırmızı=failed-heavy gün).

---

### 3.9 Build Detail Page

**Şu an:** üst header + (varsa) artifacts banner + StepGantt + filter bar + LogTable + opsiyonel ArtifactPreviewModal.

**Yeni — modüler, sekmeli yapı:**

**Header (sticky):**
- Breadcrumb · pipeline ismi + commit subject preview · status pill (büyük, animasyonlu)
- Mini meta row: build ID (copy-on-click), branch, commit sha + author, started/finished timestamps + total duration
- Action bar: `Cancel` (running) · `Re-run all` · `Retry from failed step` (mevcut) · `Download logs (.txt / .json / .zip)` · `Share permalink` · ⋮

**Tab navigation:**
1. **Overview** — büyük Gantt (mevcut StepGantt'ın geliştirilmiş hali — her step için: süre, retry sayısı, exit code, kullanılan SSH host badge) + summary kartları (succeeded/failed/skipped step count, total log lines, total artifact size).
2. **Logs** — LogTable (mevcut), filter bar (mevcut levels + node + Cmd+F arama + regex toggle) + auto-scroll on/off toggle + "jump to first error" butonu.
3. **Artifacts** — daha güzel grid. Her artifact için: dosya icon (type-aware: .ipa, .apk, .aab, .log, .png, .zip, .json), boyut, preview button (text/log/json/png/markdown inline; binary için sadece download), "Copy direct URL" + download.
4. **Pipeline** — bu build'in çalıştığı pipeline'ın read-only snapshot'ı (React Flow canvas, status overlay'li, scrubbable timeline ile — replay mode).
5. **Environment** — environment variables (encrypted olanlar `****`), system info (OS, Node version), used SSH hosts (kapasiteleriyle).
6. **Test reports (YENİ — Phase 9 hazır)** — xcresult HTML embed, JUnit summary, flaky test detection.
7. **Annotations (YENİ)** — inline compiler/SwiftLint/xcresult uyarıları, file:line link'leriyle. Phase 9.C "Inline build annotations" özelliğinin frontend'i.

**Mini-map / outline (sol kenar dar şerit):**
- Step listesi (Gantt'taki gibi sıralanmış), durum noktasıyla. Tıklayınca log o step'e scroll.

**Edge case'ler:**
- Build hâlâ "pending" — "Waiting for queue slot · 2 ahead" gösterimi.
- Legacy build (sadece flat log) — mevcut sentetik stdout entry yaklaşımı korunsun + banner: "Legacy build · per-step grouping unavailable."

---

### 3.10 SSH Hosts (Şu an Dialog → YENİ Sayfa Olarak Promote Et)

**Şu an:** modal dialog, list + form yan yana.

**Yeni:** Standalone sayfa (`/hosts`). Modal davranışı kaybolmasın — sidebar'dan "SSH Hosts" tıklanınca tam sayfaya gider, ama Pipeline editöründeki step property panel'ından "Manage hosts…" linki yine modal açar.

**Sayfa:**
- Header + `+ Add host` CTA
- Host kart grid'i (4-up @ desktop):
  - İsim, host (`user@host:port`)
  - Auth method badge (key / password)
  - Capability badges: macOS version, arch, Xcode versiyonları (chip listesi). Probe edilmemişse "Not probed" amber chip.
  - Connection status dot (Yeşil = son ping ok, Kırmızı = fail, Gri = hiç ping atılmadı)
  - "Test connection" butonu (mevcut `pingHost` aksiyonu)
  - "Open SSH session" (terminal embed gelecek özellik — şu an info butonu).
  - ⋮ Edit / Duplicate / Delete
- Sağda detay drawer: probe history grafiği, son N kullanım, hangi pipeline'larda kullanılıyor list.

**Detay form (modal veya drawer):**
- Name, host (`user@host[:port]`), identity file (path picker), password (encrypt note), `skipStrictHostKey` toggle (warning ile), description.
- Test connection inline butonu.
- "Known host fingerprint" göster — mevcut `known_hosts.json` entegrasyonu (Phase 4.D bitmiş).

---

### 3.11 Settings Sayfası (Şu an Sadece Telegram — Yeniden Düzenle)

**Şu an:** tek section, Telegram config.

**Yeni:** Sol içinde mini-nav, sağda content.

**Sections:**
1. **General**
   - Server bind host (`127.0.0.1` vs `0.0.0.0`) — `0.0.0.0` seçince **kırmızı uyarı banner**: "No authentication yet. Bind to LAN only behind a trusted network or Tailscale."
   - Server port (51731)
   - Web port (51732)
   - Default poll interval
   - DB path, artifact path (read-only display + copy + Open in explorer button)
   - Theme (Dark/Light/System — light eklenirse)
   - Density (Comfortable / Compact)
2. **Security**
   - Master key path + "Reveal" (one-time confirmation) + "Rotate master key" (destructive flow).
   - "Encrypted fields" tablo (`SENSITIVE_FIELDS` listesi) — read-only ama tüm field isimleri göster, "Encryption status: ✓ All values use enc:1:".
   - Migration log preview (config'in plaintext'ten enc'ye migrate'lendiği son N event).
3. **Notifications**
   - Native browser notifications toggle (mevcut `ensurePermission`)
   - Sound on build complete
   - Quiet hours (cron pattern)
4. **Telegram** (mevcut) — bot token + chat ID + test message. Daha güzel form layout.
5. **Webhooks**
   - GitHub / GitLab / Gitea secret env var helper UI (gerçek env'leri set edemez ama .env örneği copy-paste'lik gösterir + per-pipeline secret status).
6. **AI Integrations** (YENİ — `aiPrompt` step için global config)
   - Tool path'leri: claude, codex, aider, gemini, custom — her birinde "Test invocation" butonu (basit hello prompt).
7. **Retention**
   - `buildRetentionDays` (mevcut)
   - Artifact retention (yeni)
   - Log retention (yeni)
8. **Lanes / Concurrency** (Phase 1 Lane tipinden hazır, ama UI yok — ekle)
   - Lane'ler tablosu — `New lane` + max concurrency per lane.
9. **Vault** (YENİ — placeholder + roadmap teaser)
10. **Users & Access** (YENİ — RBAC için placeholder, "Coming in Phase 2.6")
11. **About** — versiyon, lisans, dokümantasyon link'leri, GitHub link, "Send anonymous diagnostics" toggle (default OFF, ürünün "no telemetry" felsefesine sadık).

---

### 3.12 Live Toast / Notification Stack

**Şu an:** sağ üst, yeni-commit prompt'ları (Pull / Pull & Build / Open project / Fetch).

**Yeni:**
- Toast türleri tipize edilmiş:
  - **New commit prompt** (mevcut) — eylem butonlarıyla.
  - **Build started** (transient, 4s)
  - **Build succeeded** (5s, yeşil)
  - **Build failed** (sticky until dismiss, kırmızı, "View logs" CTA + "Retry" CTA)
  - **Approval required** (manual approval step — Phase 2.6) — "Approve" / "Reject" / "View pipeline" actions.
  - **Webhook received** (transient, info)
- Stack davranışı: maks 4 görünür, fazlası "+ 3 more" linkiyle bell history'sine.
- Bell history (topbar'daki bell butonundan açılır) — son 50 notification, filter + clear.
- Reduced-motion'da slide animasyonu yerine fade.

---

### 3.13 Modallar / Dialoglar

#### 3.13.1 AddProjectDialog
- Path input (autocomplete: recent paths, `~/Documents/...` suggestions)
- "Browse…" (tarayıcı limitleri — sadece path input desteklenir)
- Default branch override (otomatik detect ama elle değiştirilebilir)
- "Watch branches" multi-select (defaults: default branch + son aktivite olanlar)
- Test git access — "Validating repo…" inline spinner + ✓ / ✕ feedback
- Submit: primary, disabled until valid
- "Create + open" vs "Create + return to list" choice

#### 3.13.2 CreatePipelineDialog
- Name input
- Watch config defaults (branch picker, interval, autoTrigger)
- **Template picker (YENİ)**: Empty · Unity Linux Server · Unity Win64 · iOS TestFlight · Android Play Beta · Steam Win64 · Notify-on-break starter · Custom from JSON paste
- Submit → editöre yönlendir

#### 3.13.3 SaveTemplateDialog
- Name + description + optional emoji/color tag
- Field-strip checkboxes (kullanıcı template'ten hangi field'ları sıfırlamak ister seçer — secret'lar default-sıfır)
- Preview of stored data JSON

#### 3.13.4 ConfirmDialog
- Mevcut variant'lar (`default`, `destructive`)
- Yeni: `typeToConfirm` variant (özellikle "Delete project" gibi geri dönüşsüz aksiyonlar için ismi yazma zorunluluğu)

#### 3.13.5 ArtifactPreviewModal
- Type-aware preview:
  - `.log`, `.txt`, `.json`, `.xml`, `.yml`, `.md` — Monaco editor read-only + syntax highlight + search (`Cmd+F`)
  - `.png`, `.jpg`, `.gif`, `.webp`, `.svg` — image viewer + zoom + fit-to-screen
  - `.ipa`, `.apk`, `.aab`, `.zip`, `.tar` — metadata only (boyut, dosya listesi eğer parse edilebilirse — opsiyonel)
  - `.plist`, `.entitlements` — XML pretty-print
  - `.xcresult` — link to Test Reports tab
- Üstte tabs: Preview · Metadata · Download
- Footer: Copy URL · Download · Close

---

## 4 · İleride Eklenecek Ekranlar (TODO.md'den Çıkarımlar)

Tasarımcı bu ekranları **mock-up seviyesinde** hazırlasın — backend henüz yok, ama UI hazır olunca implementasyon hızlanır.

1. **File Vault** (`/vault`)
   - Upload area (drag-drop): `.p12`, `.mobileprovision`, `.p8`, `GoogleService-Info.plist`, generic
   - Tablo: dosya adı, tip, boyut, upload tarihi, kullanan pipeline'lar
   - Detay: SHA-256, kim upload'ladı, `${{ files.signing_p12 }}` reference token (copy)
2. **Users & RBAC** (`/access`)
   - User list (avatar, email, role, last seen)
   - Role matrix: Owner / Maintainer / Member / Viewer × permissions tablosu
   - Audit log timeline ("Alice triggered build #4f at 12:32 from 192.168.1.20")
   - Invite user form
3. **Build Matrix Editor** (pipeline editör içinde)
   - Pipeline header'da "Matrix" toggle → açıkken matrix builder: axis'ler (xcode: [15,16] × scheme: [Free,Pro]) → grid preview "4 parallel runs"
   - Builds Page'inde matrix child'lar parent build altında nested gösterilir
4. **Manual Approval Step** (yeni step type — palette'e ekle)
   - Form inputları (release notes, version, custom prompts)
   - Pipeline duraklayınca: Builds Page'de "Awaiting approval" badge + toast + Approval dialog (sağdan drawer): step bağlamı + form + Approve/Reject + reason text
5. **Build Analytics** (`/analytics`)
   - Per-pipeline P50/P95 duration grafiği
   - Success rate trendi
   - Slowest builds leaderboard
   - DORA-ish metrics (deploy frequency, lead time)
   - Flaky test detection panosu (which tests, fail rate %, last seen)
6. **PWA Push** (Notification merkezi sistemine entegre)
   - Settings → Notifications altında "Enable web push" + service worker installation prompt
   - iOS "Add to Home Screen" guide eklenirse hazır
7. **Cache Browser** (`/caches`)
   - Phase 8 hazırlık: cache key listesi, hit/miss istatistikleri, manual evict

---

## 5 · Etkileşim & State Pattern'leri

### 5.1 Live Updates (SSE)
- Topbar connection LED, sidebar disconnect badge.
- Reconnect denemeleri exponential backoff (`1s, 2s, 4s, 8s, cap 30s`).
- Reconnect olunca: `loadProjects/Pipelines/Builds/NodeTemplates/Hosts` otomatik refresh (mevcut `onConnected` pattern korunsun).
- Optimistic update: build trigger, hostsave, pipeline save → UI hemen güncellensin, server fail ederse rollback + toast.

### 5.2 Keyboard Shortcuts (Çok Önemli — Şu Anda Yok)
- `⌘K / Ctrl+K` — Command palette
- `⌘B` — Toggle sidebar
- `⌘\` — Toggle bottom log panel
- `g p` — Go to Projects
- `g b` — Go to Builds
- `g s` — Go to Settings
- `n` — New (context-aware: Projects sayfasında new project, project sayfasında new pipeline)
- `r` — Run pipeline (pipeline veya project sayfasında)
- `?` — Shortcuts cheatsheet modal
- Pipeline editör içinde:
  - `Delete` / `Backspace` — selected node sil
  - `⌘D` — duplicate selected node
  - `⌘S` — save pipeline
  - `Space` (drag) — pan canvas
  - `⌘+` / `⌘-` — zoom
  - `f` — fit view
  - `l` — auto-layout

### 5.3 Tooltip & Help Layer
- Mevcut HTML `title=` her yerde — bunlar custom Tooltip component'ine taşınmalı (delay 400ms, koyu pill, arrow).
- Yeni: **Help tour** — first-time pipeline editör açan kullanıcıya 4-5 step'lik spotlight tour ("Drag a step here", "Wire them up", "Click to configure", "Hit Run").

### 5.4 Error Pattern'leri
- API error → toast (kırmızı, 8s sticky) + ilgili form'a inline error
- 5xx → topbar'a kırmızı banner "Server error · last sync 3m ago"
- Network down → bottom-of-screen banner

---

## 6 · Marka-Ötesi: Storytelling & Mikro-Detaylar

- **Loading mikro-metinleri:** Vercel-tarzı eğlenceli ama profesyonel ("Compiling pipeline graph…", "Polling git remote…"). Cliché olanlardan kaçın ("Doing things…").
- **Confetti / kutlama:** İlk başarılı build'de subtle confetti (reduced-motion saygılı).
- **Easter egg:** ⌘⇧B → 8-bit "Build" jingle (mute toggle eklenebilir).
- **Empty state illüstrasyonları:** Custom minimalist line art (bilgi noktası: 80s vector aesthetic, NO 3D render, NO gradient mesh, NO "guy with laptop" generic illustrations).

---

## 7 · Teknik Teslim Şartları

### 7.1 Mevcut Kodu Yeniden Düzenleyiş Sırası
1. **Design tokens'ı çıkar** — Tailwind config'ine custom color / spacing / font / animation token'ları ekle (`tailwind.config.js`).
2. **Primitive component'leri yaz** — `apps/web/src/components/ui/` altında `Button.tsx`, `Badge.tsx`, `Input.tsx`, `Dialog.tsx`, `Tooltip.tsx`, `Combobox.tsx`, `Tabs.tsx`, `Toast.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `KeyHint.tsx`, `Sparkline.tsx`.
3. **Mevcut feature component'leri primitive'lere migrate et** — `Sidebar`, `StepNode`, `StepPropertyPanel`, `BuildLogPanel`, `ToastContainer`, dialogs.
4. **Yeni Topbar + Command Palette ekle**.
5. **Pages'leri yeniden yap** — Projects, ProjectDetail, Pipeline, Builds, BuildDetail, Settings (multi-section), Hosts (page-level).
6. **Landing page apps/landing workspace olarak ekle** (Astro veya Vite-React — tercih).
7. **Future-screens için placeholder routes** ekle (Vault, Users, Analytics) — disabled badge ile.

### 7.2 Test/QA
- Storybook **opsiyonel ama tavsiye** — primitive component'ler için.
- Playwright e2e — kritik akışlar (add project, create pipeline, run build, retry-from-failed-step) için.
- Vitest unit — graph layout, log filtreleme, sparkline render.
- A11y axe-core CI'da fail-on-violation.

### 7.3 Performans
- React Flow 100+ node'da yavaşlamasın → `nodeTypes` referans-sabit (mevcut sorunu çöz — TODO'daki "Known issue").
- LogTable 5000 row'da 60fps scroll — react-window kullanımı doğru.
- SSE event'leri batch'le (15ms throttle) → state spam'ı önle.
- Bundle: code-split per route (lazy load Pipeline editör Monaco entegrasyonunu).

### 7.4 Deliverable Checklist (Tasarımcı/AI Ajanı için)
- [ ] Figma file (veya HTML mock'lar): Landing · Onboarding · Global shell (3 state: sidebar full/rail/mobile) · Projects (grid + table view) · Project Detail (Commits/Pipelines/Activity/Settings tabs) · Pipeline Editor (default + Triggers expanded + Property panel 3 tab) · Builds (table + timeline + heatmap) · Build Detail (Overview/Logs/Artifacts/Pipeline/Environment/Annotations) · Settings (10 section) · Hosts page + Hosts drawer · Tüm dialoglar · Tüm toast tipleri · Command palette · Empty + Loading + Error state'leri her yerde
- [ ] Design token JSON
- [ ] Component spec sheet (her primitive için varyantlar)
- [ ] Animation prototype'ları (Lottie veya Principle/Framer Motion preset)
- [ ] Icon set inventory (lucide kullanılanlar + custom Steam/Unity ikonları)
- [ ] Accessibility annotations (focus order, ARIA roles)
- [ ] Mobile responsive specs (read-only mod — pipeline editör tablet'te disabled overlay, masaüstüne yönlendir)
- [ ] Brand guideline mini PDF (logo kullanımı, renk, tipo, ton)

---

## 8 · Yasaklar (Kesin Yapma Listesi)

- ❌ **Material UI / Bootstrap / Ant Design** — Tailwind-first ile çakışır.
- ❌ **Genel "SaaS bot illüstrasyonları"** — proje ruhuyla çelişir.
- ❌ **3D gradient mesh / neon glassmorphism** — modaya kapılma.
- ❌ **Emoji'ler UI'da varsayılan** (user explicit isterse ekle).
- ❌ **Bilgi yoğunluğunu seyrelterek "modern minimal" yapmak** — bu bir geliştirici aracı, density bir özellik. Sadece **hiyerarşi** ile rahatla.
- ❌ **Dark mode'u kaldırmak veya light'ı varsayılan yapmak**.
- ❌ **Mevcut feature'ları yeniden tasarım uğruna kırmak** — backend API contract'ı değişmez, var olan davranış korunur.

---

## 9 · Başarı Kriterleri

Yeni tasarım, mevcut tasarıma göre şunları sağlamalı:

1. **Bilgi erişim hızı**: bir kullanıcı 5 saniyede son build'in durumunu, son commit'i, hangi pipeline'ların aktif olduğunu görmeli.
2. **Onboarding süresi**: yeni kullanıcı 3 dakikada ilk başarılı build'ini almalı (template + add project + run).
3. **Yoğunluk + nefes dengesi**: pro'lar 80+ step'lik bir pipeline'ı yorulmadan editleyebilmeli.
4. **Visual polish**: ekran görüntüsü Hacker News, Twitter/X, Bluesky'ta paylaşıma değer olmalı — Vercel/Linear/Railway seviyesinde.
5. **Performans**: First Contentful Paint < 600ms, pipeline editör 100 node'a 60fps drag.
6. **A11y**: Lighthouse Accessibility 95+.
7. **Tutarlılık**: 50+ ekran ve dialog arasında token sızıntısı (rogue hex, rogue spacing) olmamalı.

---

> **Son söz:** BuildPilot'un kalbi geliştiricinin makinesinde atıyor. UI'sı da bu felsefeyi yansıtmalı — kapalı, güçlü, kişisel; bulut değil, alet. Bu prompt'u uygulayan tasarım, kullanıcıya "evet, bu **benim** CI/CD'm" duygusu vermeli.

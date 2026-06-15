# Frontend Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded all-in-one workbench with a minimal batch production command center that keeps project switching, batch progress, chapter actions, and script editing easy to find.

**Architecture:** Keep the existing Vite + React app and backend API. Extract production-state derivation into tested pure functions, then split the large `frontend/src/main.tsx` UI into focused components while preserving the current data loading and action handlers. Low-frequency diagnostics move into drawer/details panels instead of the main screen.

**Tech Stack:** React 19, Vite 6, TypeScript, vanilla CSS, lucide-react, Vitest for lightweight pure-function tests.

---

## File Structure

- Modify `frontend/package.json` and `frontend/package-lock.json`: add `test` script and Vitest dev dependency.
- Create `frontend/src/productionState.ts`: pure functions for progress summary, next action, chapter queue stage, chapter primary action, and queue sorting.
- Create `frontend/src/productionState.test.ts`: focused tests for production summary and chapter queue actions.
- Create `frontend/src/components/ProjectSwitcher.tsx`: current project entry plus left-side project drawer, search, create project, local PDF path, file upload, and project selection.
- Create `frontend/src/components/BatchOverview.tsx`: whole-book completion, counts, progress track, and current next action.
- Create `frontend/src/components/BatchPipeline.tsx`: five-stage PDF/script/confirm/TTS/export pipeline and primary batch actions.
- Create `frontend/src/components/ChapterQueue.tsx`: minimal chapter queue with chapter number, title, stage, and one primary action.
- Create `frontend/src/components/ChapterScriptDrawer.tsx`: focused script editor plus review, artifacts, TTS, delivery, and task history in collapsed sections.
- Create `frontend/src/components/StatusPanel.tsx`: pending counts, failure counts, and advanced information affordance.
- Modify `frontend/src/main.tsx`: import new components, add drawer state, pass existing API actions into components, and remove the always-visible sidebar/script/debug sections from the main screen.
- Modify `frontend/src/styles.css`: replace the old three-column layout with command-center layout, project drawer, queue rows, and script drawer styles.

---

### Task 1: Add Production State Utilities And Tests

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/productionState.ts`
- Create: `frontend/src/productionState.test.ts`

- [ ] **Step 1: Install Vitest**

Run:

```powershell
npm install -D vitest
```

Expected: `frontend/package.json` gains `vitest` under `devDependencies`, and `frontend/package-lock.json` updates.

- [ ] **Step 2: Add the test script**

Update `frontend/package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Write failing tests for production derivation**

Create `frontend/src/productionState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  deriveProductionSummary,
  getChapterPrimaryAction,
  sortChapterQueue,
  type ChapterQueueSource,
  type ChapterStatusSource,
} from "./productionState";

const chapters: ChapterQueueSource[] = [
  { id: "c1", chapter_number: 1, title: "整个人都不太好", confidence: 0.98 },
  { id: "c2", chapter_number: 2, title: "糟糕的感觉", confidence: 0.99 },
  { id: "c3", chapter_number: 3, title: "咨询室里的对话", confidence: 0.91 },
  { id: "c4", chapter_number: 4, title: "继续往前走", confidence: 0.88 },
];

const statuses: Record<string, ChapterStatusSource> = {
  c1: {
    chapter_id: "c1",
    stage: "audio_success",
    script_blocks: 8,
    confirmed_blocks: 8,
    latest_tts_status: "success",
    latest_tts_task_id: "tts-1",
    rounds_finished: 1,
    rounds_total: 1,
    latest_tts_output_bytes: 2048,
    latest_tts_created_at: "2026-06-15T08:00:00Z",
    latest_tts_error_message: null,
  },
  c2: {
    chapter_id: "c2",
    stage: "script_confirmed",
    script_blocks: 7,
    confirmed_blocks: 7,
    latest_tts_status: null,
    latest_tts_task_id: null,
    rounds_finished: 0,
    rounds_total: 0,
    latest_tts_output_bytes: 0,
    latest_tts_created_at: null,
    latest_tts_error_message: null,
  },
  c3: {
    chapter_id: "c3",
    stage: "script_draft",
    script_blocks: 6,
    confirmed_blocks: 3,
    latest_tts_status: null,
    latest_tts_task_id: null,
    rounds_finished: 0,
    rounds_total: 0,
    latest_tts_output_bytes: 0,
    latest_tts_created_at: null,
    latest_tts_error_message: null,
  },
  c4: {
    chapter_id: "c4",
    stage: "not_started",
    script_blocks: 0,
    confirmed_blocks: 0,
    latest_tts_status: null,
    latest_tts_task_id: null,
    rounds_finished: 0,
    rounds_total: 0,
    latest_tts_output_bytes: 0,
    latest_tts_created_at: null,
    latest_tts_error_message: null,
  },
};

describe("deriveProductionSummary", () => {
  it("summarizes whole-book production and picks the next batch action", () => {
    expect(deriveProductionSummary(chapters, statuses, "pending")).toEqual({
      total: 4,
      scripted: 3,
      confirmed: 2,
      audio: 1,
      failed: 0,
      lowConfidence: 1,
      completion: 25,
      nextAction: "检查低置信章节",
      exportReady: false,
    });
  });
});

describe("getChapterPrimaryAction", () => {
  it("chooses a single main action for each chapter stage", () => {
    expect(getChapterPrimaryAction(chapters[0], statuses.c1)).toBe("view");
    expect(getChapterPrimaryAction(chapters[1], statuses.c2)).toBe("generate-audio");
    expect(getChapterPrimaryAction(chapters[2], statuses.c3)).toBe("edit-script");
    expect(getChapterPrimaryAction(chapters[3], statuses.c4)).toBe("generate-script");
  });
});

describe("sortChapterQueue", () => {
  it("orders blocked work before completed chapters", () => {
    expect(sortChapterQueue(chapters, statuses).map((item) => item.chapter.id)).toEqual([
      "c4",
      "c3",
      "c2",
      "c1",
    ]);
  });
});
```

- [ ] **Step 4: Run tests and verify they fail**

Run:

```powershell
npm run test -- productionState
```

Expected: FAIL because `frontend/src/productionState.ts` does not exist.

- [ ] **Step 5: Implement production derivation**

Create `frontend/src/productionState.ts`:

```ts
export type ChapterQueueSource = {
  id: string;
  chapter_number: number;
  title: string;
  confidence: number;
};

export type ChapterStatusSource = {
  chapter_id: string;
  stage: string;
  script_blocks: number;
  confirmed_blocks: number;
  latest_tts_status: string | null;
  latest_tts_task_id: string | null;
  rounds_finished: number;
  rounds_total: number;
  latest_tts_output_bytes: number;
  latest_tts_created_at: string | null;
  latest_tts_error_message: string | null;
};

export type ChapterPrimaryAction = "generate-script" | "edit-script" | "generate-audio" | "view";

export type ChapterQueueItem = {
  chapter: ChapterQueueSource;
  status?: ChapterStatusSource;
  stageLabel: string;
  stageTone: "neutral" | "warning" | "success" | "danger";
  primaryAction: ChapterPrimaryAction;
  priority: number;
};

export type ProductionSummary = {
  total: number;
  scripted: number;
  confirmed: number;
  audio: number;
  failed: number;
  lowConfidence: number;
  completion: number;
  nextAction: string;
  exportReady: boolean;
};

export function deriveProductionSummary(
  chapters: ChapterQueueSource[],
  statuses: Record<string, ChapterStatusSource>,
  fullAudioStatus?: string | null,
): ProductionSummary {
  const total = chapters.length;
  const values = chapters.map((chapter) => statuses[chapter.id]).filter(Boolean);
  const scripted = values.filter((item) => item.script_blocks > 0).length;
  const confirmed = values.filter(
    (item) => item.script_blocks > 0 && item.confirmed_blocks === item.script_blocks,
  ).length;
  const audio = values.filter((item) => item.stage === "audio_success").length;
  const failed = values.filter(
    (item) => item.stage === "audio_failed" || Boolean(item.latest_tts_error_message),
  ).length;
  const lowConfidence = chapters.filter((chapter) => chapter.confidence < 0.9).length;
  const completion = total ? Math.round((audio / total) * 100) : 0;

  let nextAction = "导入 PDF";
  if (total > 0 && lowConfidence > 0) nextAction = "检查低置信章节";
  else if (total > 0 && scripted < total) nextAction = "批量生成缺失脚本";
  else if (total > 0 && confirmed < total) nextAction = "确认待审核脚本";
  else if (total > 0 && audio < total) nextAction = "批量生成音频";
  else if (total > 0 && fullAudioStatus !== "success") nextAction = "合成全集";
  else if (total > 0) nextAction = "导出交付文件";

  return {
    total,
    scripted,
    confirmed,
    audio,
    failed,
    lowConfidence,
    completion,
    nextAction,
    exportReady: audio > 0,
  };
}

export function getChapterPrimaryAction(
  _chapter: ChapterQueueSource,
  status?: ChapterStatusSource,
): ChapterPrimaryAction {
  if (!status || status.script_blocks === 0) return "generate-script";
  if (status.confirmed_blocks < status.script_blocks) return "edit-script";
  if (status.latest_tts_status !== "success") return "generate-audio";
  return "view";
}

export function getChapterStageLabel(status?: ChapterStatusSource): string {
  if (!status || status.script_blocks === 0) return "缺脚本";
  if (status.confirmed_blocks < status.script_blocks) return "待确认";
  if (status.latest_tts_status === "success") return "已完成";
  if (status.stage === "audio_failed" || status.latest_tts_error_message) return "音频失败";
  return "待音频";
}

export function getChapterStageTone(status?: ChapterStatusSource): ChapterQueueItem["stageTone"] {
  if (!status || status.script_blocks === 0) return "warning";
  if (status.stage === "audio_failed" || status.latest_tts_error_message) return "danger";
  if (status.latest_tts_status === "success") return "success";
  if (status.confirmed_blocks < status.script_blocks) return "warning";
  return "neutral";
}

export function sortChapterQueue(
  chapters: ChapterQueueSource[],
  statuses: Record<string, ChapterStatusSource>,
): ChapterQueueItem[] {
  return chapters
    .map((chapter) => {
      const status = statuses[chapter.id];
      const primaryAction = getChapterPrimaryAction(chapter, status);
      const priority: Record<ChapterPrimaryAction, number> = {
        "generate-script": 0,
        "edit-script": 1,
        "generate-audio": 2,
        view: 3,
      };
      return {
        chapter,
        status,
        stageLabel: getChapterStageLabel(status),
        stageTone: getChapterStageTone(status),
        primaryAction,
        priority: priority[primaryAction],
      };
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      return left.chapter.chapter_number - right.chapter.chapter_number;
    });
}
```

- [ ] **Step 6: Run tests and build**

Run:

```powershell
npm run test -- productionState
npm run build
```

Expected: tests pass; build passes.

- [ ] **Step 7: Commit**

Run:

```powershell
git add frontend/package.json frontend/package-lock.json frontend/src/productionState.ts frontend/src/productionState.test.ts
git commit -m "test: add production state derivation"
```

---

### Task 2: Build Project Switcher Drawer

**Files:**
- Create: `frontend/src/components/ProjectSwitcher.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Create the project switcher component**

Create `frontend/src/components/ProjectSwitcher.tsx`:

```tsx
import { ChangeEvent, RefObject, useMemo, useState } from "react";
import { FolderOpen, Plus, Upload, X } from "lucide-react";

type Project = {
  id: string;
  title: string;
  book_title: string | null;
  status: string;
  updated_at: string;
};

type ProjectSwitcherProps = {
  projects: Project[];
  selectedProject: Project | null;
  projectTitle: string;
  bookTitle: string;
  localPdfPath: string;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onProjectTitleChange: (value: string) => void;
  onBookTitleChange: (value: string) => void;
  onLocalPdfPathChange: (value: string) => void;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onImportLocalPdf: () => void;
  onUploadPdf: () => void;
};

export function ProjectSwitcher({
  projects,
  selectedProject,
  projectTitle,
  bookTitle,
  localPdfPath,
  uploadInputRef,
  disabled,
  onProjectTitleChange,
  onBookTitleChange,
  onLocalPdfPathChange,
  onCreateProject,
  onSelectProject,
  onImportLocalPdf,
  onUploadPdf,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return projects;
    return projects.filter((project) =>
      [project.title, project.book_title ?? "", project.status]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [projects, query]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files?.length) setOpen(true);
  }

  return (
    <>
      <button type="button" className="projectSwitch" onClick={() => setOpen(true)}>
        <FolderOpen size={18} />
        <span>
          <small>当前项目</small>
          <strong>{selectedProject?.book_title || selectedProject?.title || "选择项目"}</strong>
        </span>
      </button>

      {open && (
        <div className="drawerOverlay" role="presentation" onClick={() => setOpen(false)}>
          <aside
            className="projectDrawer"
            aria-label="项目列表"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawerHeader">
              <div>
                <span>项目列表</span>
                <strong>切换生产项目</strong>
              </div>
              <button type="button" className="iconOnly" aria-label="关闭项目列表" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <input
              className="drawerSearch"
              value={query}
              placeholder="搜索项目、书名或状态"
              onChange={(event) => setQuery(event.target.value)}
            />

            <div className="projectDrawerList">
              {filteredProjects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  className={project.id === selectedProject?.id ? "drawerProject active" : "drawerProject"}
                  onClick={() => {
                    onSelectProject(project.id);
                    setOpen(false);
                  }}
                >
                  <strong>{project.book_title || project.title}</strong>
                  <span>{project.status} · {new Date(project.updated_at).toLocaleString()}</span>
                </button>
              ))}
              {!filteredProjects.length && <p className="emptyText">没有匹配项目</p>}
            </div>

            <div className="drawerForm">
              <label>
                项目名
                <input value={projectTitle} onChange={(event) => onProjectTitleChange(event.target.value)} />
              </label>
              <label>
                书名
                <input value={bookTitle} onChange={(event) => onBookTitleChange(event.target.value)} />
              </label>
              <button type="button" onClick={onCreateProject}>
                <Plus size={16} />
                新建项目
              </button>
            </div>

            <div className="drawerForm">
              <label>
                本地 PDF 路径
                <input
                  value={localPdfPath}
                  placeholder="E:\\books\\book.pdf"
                  onChange={(event) => onLocalPdfPathChange(event.target.value)}
                />
              </label>
              <button type="button" disabled={disabled || !localPdfPath} onClick={onImportLocalPdf}>
                <Upload size={16} />
                导入 PDF
              </button>
              <label>
                上传 PDF
                <input ref={uploadInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
              </label>
              <button type="button" disabled={disabled} onClick={onUploadPdf}>
                <Upload size={16} />
                上传
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Import and render it in the header**

Modify imports in `frontend/src/main.tsx`:

```tsx
import { ProjectSwitcher } from "./components/ProjectSwitcher";
```

Replace the current header project title area with:

```tsx
<header className="commandHeader">
  <ProjectSwitcher
    projects={projects}
    selectedProject={selectedProject}
    projectTitle={projectTitle}
    bookTitle={bookTitle}
    localPdfPath={localPdfPath}
    uploadInputRef={uploadInputRef}
    disabled={!selectedProjectId}
    onProjectTitleChange={setProjectTitle}
    onBookTitleChange={setBookTitle}
    onLocalPdfPathChange={setLocalPdfPath}
    onSelectProject={setSelectedProjectId}
    onCreateProject={() =>
      run("创建项目", async () => {
        const project = await api<Project>("/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: projectTitle, book_title: bookTitle || null }),
        });
        await refreshProjects();
        setSelectedProjectId(project.id);
      })
    }
    onImportLocalPdf={() =>
      run("导入 PDF", async () => {
        await api<Project>(`/projects/${selectedProjectId}/pdf/local`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_path: localPdfPath }),
        });
        await refreshProjects();
      })
    }
    onUploadPdf={() =>
      run("上传 PDF", async () => {
        const file = uploadInputRef.current?.files?.[0];
        if (!file) throw new Error("请选择 PDF 文件");
        const form = new FormData();
        form.append("file", file);
        await api<Project>(`/projects/${selectedProjectId}/pdf/upload`, { method: "POST", body: form });
        await refreshProjects();
      })
    }
  />
  <button type="button" className="iconButton" onClick={() => run("刷新项目", async () => {
    await refreshProjects();
    await loadChapterStatuses();
  })}>
    <RefreshCw size={16} />
    刷新
  </button>
</header>
```

- [ ] **Step 3: Remove the old always-visible project sidebar from the main layout**

Delete the old `<aside className="panel sidebar">...</aside>` block from `frontend/src/main.tsx`. Keep the create/import/upload logic only through `ProjectSwitcher`.

- [ ] **Step 4: Add drawer styles**

Append to `frontend/src/styles.css`:

```css
.commandHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
}

.projectSwitch {
  min-height: 46px;
  padding: 8px 12px;
  background: #fff;
  color: #1f2923;
  border: 1px solid #dce4de;
  border-radius: 9px;
  gap: 10px;
}

.projectSwitch span {
  display: grid;
  gap: 2px;
  text-align: left;
}

.projectSwitch small {
  color: #68736c;
  font-size: 12px;
}

.projectSwitch strong {
  max-width: min(56vw, 520px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawerOverlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(31, 41, 35, 0.18);
  display: flex;
  align-items: stretch;
}

.projectDrawer {
  width: min(392px, 92vw);
  background: #fff;
  border-right: 1px solid #dce4de;
  box-shadow: 0 24px 60px rgba(31, 41, 35, 0.18);
  padding: 16px;
  display: grid;
  grid-template-rows: auto auto minmax(120px, 1fr) auto auto;
  gap: 12px;
}

.drawerHeader {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.drawerHeader div {
  display: grid;
  gap: 3px;
}

.drawerHeader span {
  color: #68736c;
  font-size: 12px;
}

.drawerSearch {
  min-height: 38px;
}

.projectDrawerList,
.drawerForm {
  display: grid;
  gap: 8px;
}

.projectDrawerList {
  overflow: auto;
  align-content: start;
}

.drawerProject {
  display: grid;
  gap: 4px;
  text-align: left;
  background: #fff;
  color: #1f2923;
  border: 1px solid #e5ebe7;
}

.drawerProject.active {
  background: #eef5f0;
  border-color: #bcd3c5;
}

.drawerProject span {
  color: #68736c;
  font-size: 12px;
}
```

- [ ] **Step 5: Build**

Run:

```powershell
npm run build
```

Expected: build passes and the app still starts.

- [ ] **Step 6: Commit**

Run:

```powershell
git add frontend/src/main.tsx frontend/src/components/ProjectSwitcher.tsx frontend/src/styles.css
git commit -m "feat: add project switcher drawer"
```

---

### Task 3: Add Batch Overview, Pipeline, And Status Panel

**Files:**
- Create: `frontend/src/components/BatchOverview.tsx`
- Create: `frontend/src/components/BatchPipeline.tsx`
- Create: `frontend/src/components/StatusPanel.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Create `BatchOverview`**

Create `frontend/src/components/BatchOverview.tsx`:

```tsx
import type { ProductionSummary } from "../productionState";

type BatchOverviewProps = {
  summary: ProductionSummary;
  bookTitle: string;
};

export function BatchOverview({ summary, bookTitle }: BatchOverviewProps) {
  return (
    <section className="batchOverview" aria-label="整本书完成度">
      <div>
        <span>整本书完成度</span>
        <strong>{summary.completion}%</strong>
      </div>
      <div className="overviewBook">{bookTitle || "尚未选择项目"}</div>
      <div className="progressTrack" aria-label={`整本书完成度 ${summary.completion}%`}>
        <div style={{ width: `${summary.completion}%` }} />
      </div>
      <div className="overviewStats">
        <div><strong>{summary.total}</strong><span>章节</span></div>
        <div><strong>{summary.scripted}</strong><span>脚本</span></div>
        <div><strong>{summary.confirmed}</strong><span>确认</span></div>
        <div><strong>{summary.audio}</strong><span>音频</span></div>
      </div>
      <small>{summary.nextAction}</small>
    </section>
  );
}
```

- [ ] **Step 2: Create `BatchPipeline`**

Create `frontend/src/components/BatchPipeline.tsx`:

```tsx
import { Download, FileAudio, GitMerge, PackageCheck } from "lucide-react";
import type { ProductionSummary } from "../productionState";

type BatchPipelineProps = {
  summary: ProductionSummary;
  busy: string;
  hasProject: boolean;
  hasChapters: boolean;
  audioExportHref: string;
  onBatchScript: () => void;
  onBatchTts: () => void;
  onBuildFullAudio: () => void;
};

export function BatchPipeline({
  summary,
  busy,
  hasProject,
  hasChapters,
  audioExportHref,
  onBatchScript,
  onBatchTts,
  onBuildFullAudio,
}: BatchPipelineProps) {
  const running = Boolean(busy);
  const stages = [
    { label: "PDF", value: hasProject ? "已就绪" : "未选择" },
    { label: "脚本", value: `${summary.scripted} / ${summary.total}` },
    { label: "确认", value: `${summary.confirmed} / ${summary.total}` },
    { label: "TTS", value: `${summary.audio} / ${summary.total}` },
    { label: "导出", value: summary.exportReady ? "可导出" : "待音频" },
  ];

  return (
    <section className="batchPipeline" aria-label="当前批处理">
      <div className="sectionHeader">
        <strong>当前批处理</strong>
        <span>{running ? "运行中" : "待命"}</span>
      </div>
      <div className="pipelineStages">
        {stages.map((stage) => (
          <div className="pipelineStage" key={stage.label}>
            <strong>{stage.label}</strong>
            <span>{stage.value}</span>
          </div>
        ))}
      </div>
      <div className="batchActions">
        <button type="button" disabled={!hasProject || !hasChapters || running} onClick={onBatchScript}>
          <GitMerge size={16} />
          批量 LangGraph 脚本
        </button>
        <button type="button" disabled={!hasProject || !hasChapters || running} onClick={onBatchTts}>
          <FileAudio size={16} />
          批量音频
        </button>
        <button type="button" disabled={!hasProject || !summary.audio || running} onClick={onBuildFullAudio}>
          <PackageCheck size={16} />
          合成全集
        </button>
        <a className={summary.exportReady ? "primaryLinkButton" : "primaryLinkButton disabled"} href={audioExportHref} download>
          <Download size={16} />
          导出 ZIP
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `StatusPanel`**

Create `frontend/src/components/StatusPanel.tsx`:

```tsx
import type { ProductionSummary } from "../productionState";

type StatusPanelProps = {
  summary: ProductionSummary;
  lastScriptFailed: number;
  lastTtsFailed: number;
  notice: string;
};

export function StatusPanel({ summary, lastScriptFailed, lastTtsFailed, notice }: StatusPanelProps) {
  return (
    <aside className="statusPanel" aria-label="待处理">
      <section>
        <strong>待处理</strong>
        <div className="statusRows">
          <div><span>缺失脚本</span><strong>{Math.max(summary.total - summary.scripted, 0)}</strong></div>
          <div><span>待确认脚本</span><strong>{Math.max(summary.scripted - summary.confirmed, 0)}</strong></div>
          <div><span>待生成音频</span><strong>{Math.max(summary.confirmed - summary.audio, 0)}</strong></div>
          <div><span>低置信章节</span><strong>{summary.lowConfidence}</strong></div>
        </div>
      </section>
      <section>
        <strong>失败重试</strong>
        <div className="statusRows">
          <div><span>脚本失败</span><strong>{lastScriptFailed}</strong></div>
          <div><span>音频失败</span><strong>{lastTtsFailed}</strong></div>
        </div>
      </section>
      <section className="mutedPanel">
        <strong>状态</strong>
        <p>{notice}</p>
      </section>
    </aside>
  );
}
```

- [ ] **Step 4: Wire derived summary in `main.tsx`**

Import components and utility:

```tsx
import { BatchOverview } from "./components/BatchOverview";
import { BatchPipeline } from "./components/BatchPipeline";
import { StatusPanel } from "./components/StatusPanel";
import { deriveProductionSummary } from "./productionState";
```

Add the memo inside `App`:

```tsx
const productionSummary = useMemo(
  () => deriveProductionSummary(chapters, chapterStatuses, fullAudioTask?.status),
  [chapters, chapterStatuses, fullAudioTask?.status],
);
```

Replace the old `projectDashboard` section with:

```tsx
<div className="commandGrid">
  <BatchOverview
    summary={productionSummary}
    bookTitle={selectedProject?.book_title || selectedProject?.title || ""}
  />
  <BatchPipeline
    summary={productionSummary}
    busy={busy}
    hasProject={Boolean(selectedProjectId)}
    hasChapters={Boolean(chapters.length)}
    audioExportHref={`${API_BASE}/projects/${selectedProjectId}/audio/chapters/export`}
    onBatchScript={() => run("批量 LangGraph 脚本", runBatchScript)}
    onBatchTts={() => run("批量音频", runBatchTts)}
    onBuildFullAudio={() => run("合成全集", runBuildFullAudio)}
  />
</div>
```

Render `StatusPanel` beside the chapter queue in Task 4.

- [ ] **Step 5: Add command-center CSS**

Append to `frontend/src/styles.css`:

```css
.commandGrid {
  display: grid;
  grid-template-columns: minmax(260px, 0.75fr) minmax(520px, 1.55fr);
  gap: 14px;
  margin-bottom: 14px;
}

.batchOverview {
  background: #1f2923;
  color: #f4f7f3;
  border-radius: 14px;
  padding: 18px;
  display: grid;
  gap: 14px;
}

.batchOverview > div:first-child {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.batchOverview span,
.batchOverview small {
  color: #b7c5bd;
}

.batchOverview > div:first-child strong {
  font-size: 40px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.overviewBook {
  color: #fff;
  font-weight: 650;
}

.overviewStats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.overviewStats strong {
  display: block;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.batchPipeline,
.statusPanel section {
  background: #fff;
  border: 1px solid #dce4de;
  border-radius: 14px;
  padding: 16px;
}

.batchPipeline {
  display: grid;
  gap: 14px;
}

.pipelineStages {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.pipelineStage {
  padding: 11px 10px;
  border-radius: 10px;
  background: #f8faf7;
  border: 1px solid #dce4de;
}

.pipelineStage strong,
.pipelineStage span {
  display: block;
}

.pipelineStage span {
  color: #68736c;
  font-size: 12px;
  margin-top: 4px;
}

.batchActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.statusPanel {
  display: grid;
  gap: 12px;
}

.statusRows {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.statusRows div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.mutedPanel {
  color: #68736c;
}

@media (max-width: 900px) {
  .commandGrid {
    grid-template-columns: 1fr;
  }

  .pipelineStages {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 6: Test and commit**

Run:

```powershell
npm run test -- productionState
npm run build
```

Expected: tests and build pass.

Commit:

```powershell
git add frontend/src/main.tsx frontend/src/components/BatchOverview.tsx frontend/src/components/BatchPipeline.tsx frontend/src/components/StatusPanel.tsx frontend/src/styles.css
git commit -m "feat: add batch command center overview"
```

---

### Task 4: Replace Chapter List With Minimal Chapter Queue

**Files:**
- Create: `frontend/src/components/ChapterQueue.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Create `ChapterQueue`**

Create `frontend/src/components/ChapterQueue.tsx`:

```tsx
import type { ChapterQueueItem, ChapterPrimaryAction } from "../productionState";

type ChapterQueueProps = {
  items: ChapterQueueItem[];
  onGenerateScript: (chapterId: string) => void;
  onEditScript: (chapterId: string) => void;
  onGenerateAudio: (chapterId: string) => void;
  onView: (chapterId: string) => void;
};

const actionLabels: Record<ChapterPrimaryAction, string> = {
  "generate-script": "生成脚本",
  "edit-script": "编辑脚本",
  "generate-audio": "生成音频",
  view: "查看",
};

export function ChapterQueue({
  items,
  onGenerateScript,
  onEditScript,
  onGenerateAudio,
  onView,
}: ChapterQueueProps) {
  function runAction(action: ChapterPrimaryAction, chapterId: string) {
    if (action === "generate-script") onGenerateScript(chapterId);
    if (action === "edit-script") onEditScript(chapterId);
    if (action === "generate-audio") onGenerateAudio(chapterId);
    if (action === "view") onView(chapterId);
  }

  return (
    <section className="chapterQueue" aria-label="章节队列">
      <div className="queueHeader">
        <div>
          <strong>章节队列</strong>
          <span>按阻塞优先排序</span>
        </div>
      </div>
      <div className="queueColumns">
        <span>章</span>
        <span>标题</span>
        <span>状态</span>
        <span>动作</span>
      </div>
      {items.map((item) => (
        <article className="queueRow" key={item.chapter.id}>
          <span className="queueNumber">{String(item.chapter.chapter_number).padStart(2, "0")}</span>
          <strong title={item.chapter.title}>{item.chapter.title}</strong>
          <span className={`queueStage ${item.stageTone}`}>{item.stageLabel}</span>
          <button type="button" onClick={() => runAction(item.primaryAction, item.chapter.id)}>
            {actionLabels[item.primaryAction]}
          </button>
        </article>
      ))}
      {!items.length && <p className="emptyText">导入并解析 PDF 后显示章节队列。</p>}
    </section>
  );
}
```

- [ ] **Step 2: Wire queue items and actions in `main.tsx`**

Import:

```tsx
import { ChapterQueue } from "./components/ChapterQueue";
import { sortChapterQueue } from "./productionState";
```

Add state:

```tsx
const [scriptDrawerOpen, setScriptDrawerOpen] = useState(false);
```

Add memo:

```tsx
const chapterQueueItems = useMemo(
  () => sortChapterQueue(chapters, chapterStatuses),
  [chapters, chapterStatuses],
);
```

Add action helpers inside `App`:

```tsx
function openChapterDrawer(chapterId: string) {
  setSelectedChapterId(chapterId);
  setScriptDrawerOpen(true);
}

function generateScriptForChapter(chapterId: string) {
  setSelectedChapterId(chapterId);
  run("LangGraph 脚本", async () => {
    const data = await api<ScriptGraphResult>(
      `/projects/${selectedProjectId}/chapters/${chapterId}/script-graph`,
      { method: "POST" },
    );
    setScriptBlocks(data.script_blocks);
    await loadLatestAnalysis(chapterId);
    await loadLatestPlan(chapterId);
    await loadLatestScriptReview(chapterId);
    await loadChapterStatuses();
    setScriptDrawerOpen(true);
  });
}

function generateAudioForChapter(chapterId: string) {
  setSelectedChapterId(chapterId);
  run("生成 TTS", async () => {
    const task = await api<TtsTask>(
      `/projects/${selectedProjectId}/chapters/${chapterId}/tts/generate`,
      { method: "POST" },
    );
    setTtsTask(task);
    await loadTtsTasks(chapterId);
    await loadChapterStatuses();
    setScriptDrawerOpen(true);
  });
}
```

Render the command body:

```tsx
<div className="commandBody">
  <ChapterQueue
    items={chapterQueueItems}
    onGenerateScript={generateScriptForChapter}
    onEditScript={openChapterDrawer}
    onGenerateAudio={generateAudioForChapter}
    onView={openChapterDrawer}
  />
  <StatusPanel
    summary={productionSummary}
    lastScriptFailed={lastScriptFailedIds.length}
    lastTtsFailed={lastTtsFailedIds.length}
    notice={notice}
  />
</div>
```

- [ ] **Step 3: Remove old visible chapter list from main screen**

Delete the old always-visible `.chapterList` block from `frontend/src/main.tsx`. Chapter review, full chapter text, low-confidence repair, and manual chapter tools should move into a collapsed advanced section only if kept on the main screen; otherwise keep them available through the detail drawer in Task 5.

- [ ] **Step 4: Add queue styles**

Append to `frontend/src/styles.css`:

```css
.commandBody {
  display: grid;
  grid-template-columns: minmax(600px, 1.65fr) minmax(260px, 0.65fr);
  gap: 14px;
  align-items: start;
}

.chapterQueue {
  background: #fff;
  border: 1px solid #dce4de;
  border-radius: 14px;
  overflow: hidden;
}

.queueHeader {
  padding: 14px 16px;
  border-bottom: 1px solid #e8eee9;
  display: flex;
  justify-content: space-between;
}

.queueHeader div {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.queueHeader span {
  color: #68736c;
  font-size: 12px;
}

.queueColumns,
.queueRow {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) 120px 110px;
  gap: 10px;
  align-items: center;
}

.queueColumns {
  padding: 10px 16px;
  background: #f8faf7;
  color: #68736c;
  font-size: 12px;
}

.queueRow {
  padding: 13px 16px;
  border-top: 1px solid #edf2ee;
}

.queueRow strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queueNumber {
  font-variant-numeric: tabular-nums;
  color: #68736c;
}

.queueStage {
  font-size: 13px;
}

.queueStage.warning {
  color: #8a5a19;
}

.queueStage.success {
  color: #2f7651;
}

.queueStage.danger {
  color: #a33b2f;
}

.queueRow button {
  min-height: 32px;
  padding: 6px 9px;
}

@media (max-width: 900px) {
  .commandBody {
    grid-template-columns: 1fr;
  }

  .queueColumns {
    display: none;
  }

  .queueRow {
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .queueRow button,
  .queueStage {
    grid-column: 2;
  }
}
```

- [ ] **Step 5: Test and commit**

Run:

```powershell
npm run test -- productionState
npm run build
```

Expected: tests and build pass.

Commit:

```powershell
git add frontend/src/main.tsx frontend/src/components/ChapterQueue.tsx frontend/src/styles.css
git commit -m "feat: add minimal chapter queue"
```

---

### Task 5: Move Script Editing And Advanced Data Into Drawer

**Files:**
- Create: `frontend/src/components/ChapterScriptDrawer.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Create the script drawer component**

Create `frontend/src/components/ChapterScriptDrawer.tsx`:

```tsx
import { Check, FileAudio, Lock, Unlock, X } from "lucide-react";

type Chapter = {
  id: string;
  chapter_number: number;
  title: string;
  start_page: number;
  end_page: number;
  preview: string;
};

type ScriptBlock = {
  id: string;
  block_index: number;
  speaker: "Alice" | "Dr_Ye";
  text: string;
  locked: boolean;
  status: string;
  estimated_seconds: number;
};

type JsonArtifact = {
  id: string;
  status: string;
  content_json: Record<string, unknown>;
};

type TtsTask = {
  id: string;
  status: string;
  rounds_finished: number;
  rounds_total: number;
  output_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ChapterScriptDrawerProps = {
  open: boolean;
  chapter: Chapter | null;
  scriptBlocks: ScriptBlock[];
  analysisReport: JsonArtifact | null;
  podcastPlan: JsonArtifact | null;
  scriptReview: JsonArtifact | null;
  ttsTask: TtsTask | null;
  ttsTasks: TtsTask[];
  audioSrc: string;
  audioDownloadHref: string;
  onClose: () => void;
  onConfirmScript: () => void;
  onGenerateAudio: () => void;
  onChangeBlockText: (blockId: string, text: string) => void;
  onSaveBlock: (block: ScriptBlock) => void;
  onToggleBlockLock: (block: ScriptBlock) => void;
  onRefreshTtsTasks: () => void;
};

export function ChapterScriptDrawer({
  open,
  chapter,
  scriptBlocks,
  analysisReport,
  podcastPlan,
  scriptReview,
  ttsTask,
  ttsTasks,
  audioSrc,
  audioDownloadHref,
  onClose,
  onConfirmScript,
  onGenerateAudio,
  onChangeBlockText,
  onSaveBlock,
  onToggleBlockLock,
  onRefreshTtsTasks,
}: ChapterScriptDrawerProps) {
  if (!open) return null;

  return (
    <div className="drawerOverlay detailOverlay" role="presentation" onClick={onClose}>
      <aside className="scriptDrawer" aria-label="章节脚本编辑" onClick={(event) => event.stopPropagation()}>
        <div className="drawerHeader">
          <div>
            <span>{chapter ? `第 ${chapter.chapter_number} 章` : "未选择章节"}</span>
            <strong>{chapter?.title || "脚本编辑"}</strong>
          </div>
          <button type="button" className="iconOnly" aria-label="关闭脚本编辑" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="drawerActions">
          <button type="button" disabled={!scriptBlocks.length} onClick={onConfirmScript}>
            <Check size={16} />
            保存并确认
          </button>
          <button type="button" disabled={!scriptBlocks.length} onClick={onGenerateAudio}>
            <FileAudio size={16} />
            生成音频
          </button>
        </div>

        <div className="scriptDrawerGrid">
          <section className="scriptEditor">
            <div className="sectionHeader">
              <strong>脚本正文</strong>
              <span>{scriptBlocks.length} 段</span>
            </div>
            {scriptBlocks.map((block) => (
              <article className="scriptBlock" key={block.id}>
                <div className="blockHeader">
                  <span>{block.block_index}. {block.speaker}</span>
                  <span>{block.status}</span>
                  <button
                    type="button"
                    className="iconOnly"
                    aria-label={block.locked ? "解锁脚本块" : "锁定脚本块"}
                    onClick={() => onToggleBlockLock(block)}
                  >
                    {block.locked ? <Lock size={15} /> : <Unlock size={15} />}
                  </button>
                </div>
                <textarea
                  disabled={block.locked}
                  value={block.text}
                  onChange={(event) => onChangeBlockText(block.id, event.target.value)}
                  onBlur={() => onSaveBlock(block)}
                />
              </article>
            ))}
            {!scriptBlocks.length && <p className="emptyText">生成脚本后可在这里编辑。</p>}
          </section>

          <section className="scriptSide">
            <details open={Boolean(scriptReview)} className="artifact">
              <summary><span>审核建议</span><small>{scriptReview?.status ?? "未生成"}</small></summary>
              {scriptReview ? <pre>{JSON.stringify(scriptReview.content_json, null, 2)}</pre> : <p>暂无审核报告</p>}
            </details>
            <details className="artifact">
              <summary><span>原文 / 分析</span><small>{analysisReport?.status ?? "未生成"}</small></summary>
              {analysisReport ? <pre>{JSON.stringify(analysisReport.content_json, null, 2)}</pre> : <p>{chapter?.preview || "暂无章节预览"}</p>}
            </details>
            <details className="artifact">
              <summary><span>播客策划</span><small>{podcastPlan?.status ?? "未生成"}</small></summary>
              {podcastPlan ? <pre>{JSON.stringify(podcastPlan.content_json, null, 2)}</pre> : <p>暂无策划结果</p>}
            </details>
            <details className="artifact">
              <summary><span>TTS</span><small>{ttsTask ? `${ttsTask.status} · ${ttsTask.rounds_finished}/${ttsTask.rounds_total}` : "未生成"}</small></summary>
              {ttsTask?.status === "success" && (
                <>
                  <audio controls src={audioSrc} />
                  <a className="downloadLink" href={audioDownloadHref} download>下载 MP3</a>
                </>
              )}
              {ttsTask?.error_message && <small>{ttsTask.error_message}</small>}
              <button type="button" className="ghostButton" onClick={onRefreshTtsTasks}>刷新 TTS 历史</button>
              <div className="taskHistory compactHistory">
                {ttsTasks.map((task) => (
                  <article className="taskItem" key={task.id}>
                    <div>
                      <strong>{task.status}</strong>
                      <span>{task.rounds_finished}/{task.rounds_total} · {new Date(task.created_at).toLocaleString()}</span>
                    </div>
                    {task.error_message && <small>{task.error_message}</small>}
                  </article>
                ))}
              </div>
            </details>
          </section>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Wire drawer in `main.tsx`**

Import:

```tsx
import { ChapterScriptDrawer } from "./components/ChapterScriptDrawer";
```

Render after `commandBody`:

```tsx
<ChapterScriptDrawer
  open={scriptDrawerOpen}
  chapter={selectedChapter}
  scriptBlocks={scriptBlocks}
  analysisReport={analysisReport}
  podcastPlan={podcastPlan}
  scriptReview={scriptReview}
  ttsTask={ttsTask}
  ttsTasks={ttsTasks}
  audioSrc={`${API_BASE}/projects/${selectedProjectId}/chapters/${selectedChapterId}/tts/tasks/${ttsTask?.id}/audio`}
  audioDownloadHref={`${API_BASE}/projects/${selectedProjectId}/chapters/${selectedChapterId}/tts/tasks/${ttsTask?.id}/audio`}
  onClose={() => setScriptDrawerOpen(false)}
  onConfirmScript={() =>
    run("确认脚本", async () => {
      const data = await api<ScriptBlock[]>(
        `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script/confirm`,
        { method: "POST" },
      );
      setScriptBlocks(data);
      await loadChapterStatuses();
    })
  }
  onGenerateAudio={() => selectedChapterId && generateAudioForChapter(selectedChapterId)}
  onChangeBlockText={(blockId, text) =>
    setScriptBlocks((items) =>
      items.map((item) => (item.id === blockId ? { ...item, text } : item)),
    )
  }
  onSaveBlock={(block) =>
    run("保存脚本块", async () => {
      const updated = await api<ScriptBlock>(
        `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script-blocks/${block.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: block.text }),
        },
      );
      setScriptBlocks((items) => items.map((item) => (item.id === block.id ? updated : item)));
    })
  }
  onToggleBlockLock={(block) =>
    run(block.locked ? "解锁脚本块" : "锁定脚本块", async () => {
      const updated = await api<ScriptBlock>(
        `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script-blocks/${block.id}/lock`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locked: !block.locked }),
        },
      );
      setScriptBlocks((items) => items.map((item) => (item.id === block.id ? updated : item)));
    })
  }
  onRefreshTtsTasks={() => run("刷新 TTS 历史", () => loadTtsTasks())}
/>
```

- [ ] **Step 3: Remove old always-visible script panel sections**

Delete the always-visible `artifactGrid`, `reviewArtifact`, `ttsStatus`, `deliveryPanel`, `taskHistory`, and `scriptBlocks` sections from the main screen. Keep equivalent content inside `ChapterScriptDrawer`. Keep advanced batch retry buttons either inside `BatchPipeline` follow-up controls or a collapsed advanced details block below the pipeline.

- [ ] **Step 4: Add drawer styles**

Append to `frontend/src/styles.css`:

```css
.detailOverlay {
  justify-content: flex-end;
}

.scriptDrawer {
  width: min(1120px, 96vw);
  height: 100%;
  background: #f6f7f3;
  border-left: 1px solid #dce4de;
  box-shadow: -24px 0 60px rgba(31, 41, 35, 0.18);
  padding: 18px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
  overflow: hidden;
}

.drawerActions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.scriptDrawerGrid {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(520px, 1.35fr) minmax(280px, 0.65fr);
  gap: 14px;
}

.scriptEditor,
.scriptSide {
  min-height: 0;
  overflow: auto;
}

.scriptEditor {
  background: #fff;
  border: 1px solid #dce4de;
  border-radius: 14px;
  padding: 14px;
  display: grid;
  gap: 10px;
  align-content: start;
}

.scriptSide {
  display: grid;
  gap: 10px;
  align-content: start;
}

.compactHistory {
  margin-top: 10px;
}

@media (max-width: 900px) {
  .scriptDrawer {
    width: 100vw;
  }

  .scriptDrawerGrid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Test and commit**

Run:

```powershell
npm run test -- productionState
npm run build
```

Expected: tests and build pass.

Commit:

```powershell
git add frontend/src/main.tsx frontend/src/components/ChapterScriptDrawer.tsx frontend/src/styles.css
git commit -m "feat: move script editing into drawer"
```

---

### Task 6: Polish Responsive Layout And Verify In Browser

**Files:**
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/main.tsx` if final cleanup reveals dead markup or imports.

- [ ] **Step 1: Remove unused imports and dead CSS**

Run:

```powershell
npm run build
```

Expected: TypeScript reports unused imports if `noUnusedLocals` is enabled; Vite build reports syntax errors. Remove any unused lucide imports and old CSS that no longer matches rendered markup.

- [ ] **Step 2: Add final responsive CSS guardrails**

Append or merge these rules into `frontend/src/styles.css`:

```css
.workspace {
  min-height: 100dvh;
  padding: 22px;
}

button,
.primaryLinkButton,
.downloadLink {
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

button:active,
.primaryLinkButton:active,
.downloadLink:active {
  transform: translateY(1px);
}

button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid #6e8b77;
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .workspace {
    padding: 12px;
  }

  .commandHeader {
    flex-direction: column;
  }

  .projectSwitch {
    width: 100%;
    justify-content: flex-start;
  }

  .overviewStats {
    grid-template-columns: repeat(2, 1fr);
  }

  .batchActions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .batchActions button,
  .batchActions a {
    width: 100%;
  }
}
```

- [ ] **Step 3: Run automated checks**

Run:

```powershell
npm run test -- productionState
npm run build
```

Expected: tests and build pass.

- [ ] **Step 4: Start or reuse the dev server**

Run:

```powershell
npm run dev -- --port 5174
```

Expected: Vite serves the app on `http://127.0.0.1:5174/`. If port 5174 is busy, use the printed available port.

- [ ] **Step 5: Browser desktop verification**

Open `http://127.0.0.1:5174/` in the in-app browser and verify:

- The first screen shows current project, whole-book completion, batch pipeline, chapter queue, and status panel.
- The project drawer opens from the left and contains search, project list, create project, local PDF path, upload PDF.
- The main screen does not show script text, raw JSON, full review report, full chapter text, or task history.
- Clicking a chapter action opens the script drawer.
- Script drawer shows editable script blocks and collapsed review/analysis/plan/TTS details.

- [ ] **Step 6: Browser narrow-width verification**

Set the browser viewport to a narrow width around 390px and verify:

- Header stacks without overlapping text.
- Project drawer width stays within the viewport.
- Batch stages wrap cleanly.
- Chapter queue rows do not overflow horizontally.
- Script drawer becomes single column.

- [ ] **Step 7: Commit final polish**

Run:

```powershell
git add frontend/src/main.tsx frontend/src/styles.css
git commit -m "style: polish command center responsiveness"
```

---

### Task 7: Final Full-Repo Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run frontend verification**

Run:

```powershell
cd frontend
npm run test -- productionState
npm run build
```

Expected: tests and build pass.

- [ ] **Step 2: Run backend regression tests from repo root**

Run:

```powershell
cd ..
$env:PYTHONPATH="backend"
python -m pytest -q
```

Expected: backend tests pass.

- [ ] **Step 3: Inspect git status**

Run:

```powershell
git status --short
```

Expected: only intentional files are modified. The pre-existing untracked `LANGGRAPH_MIGRATION_EXECUTION_PLAN.md` may still appear and must not be added unless the user explicitly asks.

- [ ] **Step 4: Prepare completion summary**

Summarize:

- Components created.
- Main screen information removed or moved.
- Tests and build commands run.
- Browser verification result.
- Any remaining risks or follow-up work.


import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RefreshCw } from "lucide-react";
import { BatchOverview } from "./components/BatchOverview";
import { BatchPipeline } from "./components/BatchPipeline";
import { ChapterQueue } from "./components/ChapterQueue";
import { ChapterScriptDrawer } from "./components/ChapterScriptDrawer";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { StatusPanel } from "./components/StatusPanel";
import { deriveProductionSummary, sortChapterQueue } from "./productionState";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000/api";

type Project = {
  id: string;
  title: string;
  book_title: string | null;
  status: string;
  updated_at: string;
};

type Chapter = {
  id: string;
  chapter_number: number;
  title: string;
  start_page: number;
  end_page: number;
  source: string;
  chars_no_whitespace: number;
  confidence: number;
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

type JsonArtifact = {
  id: string;
  status: string;
  content_json: Record<string, unknown>;
};

type BatchScriptResult = {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  elapsed_seconds: number;
  failed_chapter_ids: string[];
};

type BatchTTSResult = {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  elapsed_seconds: number;
  failed_chapter_ids: string[];
};

type FullAudioTask = {
  id: string;
  status: string;
  chapters_total: number;
  chapters_included: number;
  chapters_missing: number;
  output_path: string | null;
  output_bytes: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ScriptGraphResult = {
  analysis: JsonArtifact | null;
  plan: JsonArtifact | null;
  script_blocks: ScriptBlock[];
  review: JsonArtifact | null;
  book_type: string | null;
  review_passed: boolean;
  retry_count: number;
  max_retries: number;
  next_action: string;
  error: string | null;
};

type ChapterProductionStatus = {
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

type PipelineRunState = {
  label: string;
  status: "running" | "success" | "failed";
  started_at?: number;
  elapsed_seconds?: number;
  target_chapters?: number;
  chapters_done?: number;
  chapters_failed?: number;
  chapters_skipped?: number;
  script_blocks?: number;
  book_type?: string | null;
  review_passed?: boolean;
  retry_count?: number;
  max_retries?: number;
  next_action?: string | null;
  message?: string | null;
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `请求失败：${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function optionalApi<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API_BASE}${path}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `请求失败：${response.status}`);
  }
  return response.json() as Promise<T>;
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} 分 ${rest} 秒`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  const [ttsTask, setTtsTask] = useState<TtsTask | null>(null);
  const [ttsTasks, setTtsTasks] = useState<TtsTask[]>([]);
  const [analysisReport, setAnalysisReport] = useState<JsonArtifact | null>(null);
  const [podcastPlan, setPodcastPlan] = useState<JsonArtifact | null>(null);
  const [scriptReview, setScriptReview] = useState<JsonArtifact | null>(null);
  const [chapterStatuses, setChapterStatuses] = useState<Record<string, ChapterProductionStatus>>({});
  const [fullAudioTask, setFullAudioTask] = useState<FullAudioTask | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("准备就绪");
  const [pipelineRun, setPipelineRun] = useState<PipelineRunState | null>(null);
  const [lastScriptFailedIds, setLastScriptFailedIds] = useState<string[]>([]);
  const [lastTtsFailedIds, setLastTtsFailedIds] = useState<string[]>([]);
  const [clockTick, setClockTick] = useState(Date.now());
  const [projectTitle, setProjectTitle] = useState("Smoke Test");
  const [bookTitle, setBookTitle] = useState("");
  const [localPdfPath, setLocalPdfPath] = useState("");
  const [scriptDrawerOpen, setScriptDrawerOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectedChapter = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId) ?? null,
    [chapters, selectedChapterId],
  );

  const productionSummary = useMemo(
    () => deriveProductionSummary(chapters, chapterStatuses, fullAudioTask?.status),
    [chapters, chapterStatuses, fullAudioTask?.status],
  );

  const chapterQueueItems = useMemo(
    () => sortChapterQueue(chapters, chapterStatuses),
    [chapters, chapterStatuses],
  );

  const chapterAudioBytes = useMemo(
    () =>
      chapters.reduce(
        (total, chapter) => total + (chapterStatuses[chapter.id]?.latest_tts_output_bytes ?? 0),
        0,
      ),
    [chapters, chapterStatuses],
  );

  const pipelineElapsed = useMemo(() => {
    if (!pipelineRun) return null;
    if (pipelineRun.status === "running" && pipelineRun.started_at) {
      return (clockTick - pipelineRun.started_at) / 1000;
    }
    return pipelineRun.elapsed_seconds ?? null;
  }, [clockTick, pipelineRun]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setNotice(`${label}中`);
    try {
      await action();
      setNotice(`${label}完成`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message);
      throw error;
    } finally {
      setBusy("");
    }
  }

  async function refreshProjects() {
    const data = await api<Project[]>("/projects");
    setProjects(data);
    if (!data.length) {
      setSelectedProjectId("");
      return;
    }
    const currentStillExists = data.some((item) => item.id === selectedProjectId);
    if (!selectedProjectId || !currentStillExists) {
      setSelectedProjectId(data[0].id);
    }
  }

  async function loadChapters(projectId = selectedProjectId) {
    if (!projectId) {
      setChapters([]);
      setSelectedChapterId("");
      return;
    }
    const data = await api<Chapter[]>(`/projects/${projectId}/chapters`);
    setChapters(data);
    if (!data.length) {
      setSelectedChapterId("");
      return;
    }
    if (!data.some((chapter) => chapter.id === selectedChapterId)) {
      setSelectedChapterId(data[0].id);
    }
  }

  async function loadChapterStatuses(projectId = selectedProjectId) {
    if (!projectId) {
      setChapterStatuses({});
      return;
    }
    const data = await api<ChapterProductionStatus[]>(
      `/projects/${projectId}/chapters/production-status`,
    );
    setChapterStatuses(Object.fromEntries(data.map((item) => [item.chapter_id, item])));
  }

  async function loadLatestAnalysis(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) {
      setAnalysisReport(null);
      return;
    }
    setAnalysisReport(
      await optionalApi<JsonArtifact>(`/projects/${selectedProjectId}/chapters/${chapterId}/analysis/latest`),
    );
  }

  async function loadLatestPlan(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) {
      setPodcastPlan(null);
      return;
    }
    setPodcastPlan(
      await optionalApi<JsonArtifact>(`/projects/${selectedProjectId}/chapters/${chapterId}/plan/latest`),
    );
  }

  async function loadLatestScriptReview(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) {
      setScriptReview(null);
      return;
    }
    setScriptReview(
      await optionalApi<JsonArtifact>(`/projects/${selectedProjectId}/chapters/${chapterId}/script-review/latest`),
    );
  }

  async function loadScript(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) {
      setScriptBlocks([]);
      return;
    }
    setScriptBlocks(
      await api<ScriptBlock[]>(`/projects/${selectedProjectId}/chapters/${chapterId}/script-blocks`),
    );
  }

  async function loadLatestTtsTask(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) {
      setTtsTask(null);
      return;
    }
    setTtsTask(
      await optionalApi<TtsTask>(`/projects/${selectedProjectId}/chapters/${chapterId}/tts/tasks/latest`),
    );
  }

  async function loadTtsTasks(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) {
      setTtsTasks([]);
      return;
    }
    setTtsTasks(
      await api<TtsTask[]>(`/projects/${selectedProjectId}/chapters/${chapterId}/tts/tasks`),
    );
  }

  async function loadLatestFullAudio(projectId = selectedProjectId) {
    if (!projectId) {
      setFullAudioTask(null);
      return;
    }
    setFullAudioTask(await optionalApi<FullAudioTask>(`/projects/${projectId}/audio/full/latest`));
  }

  async function parsePdf() {
    if (!selectedProjectId) return;
    await run("解析 PDF", async () => {
      await api(`/projects/${selectedProjectId}/parse`, { method: "POST" });
      await loadChapters();
      await loadChapterStatuses();
    });
  }

  async function runBatchScript(chapterIds?: string[]) {
    if (!selectedProjectId) return;
    setPipelineRun({
      label: chapterIds?.length ? "重跑失败脚本" : "批量 LangGraph 脚本",
      status: "running",
      started_at: Date.now(),
      target_chapters: chapterIds?.length ?? chapters.length,
      message: "只补齐缺失或指定章节",
    });
    const data = await api<BatchScriptResult>(
      `/projects/${selectedProjectId}/chapters/script-graph-batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skip_existing: !chapterIds?.length,
          ...(chapterIds?.length ? { chapter_ids: chapterIds } : {}),
        }),
      },
    );
    setPipelineRun({
      label: chapterIds?.length ? "重跑失败脚本" : "批量 LangGraph 脚本",
      status: data.failed ? "failed" : "success",
      target_chapters: data.total,
      chapters_done: data.succeeded,
      chapters_skipped: data.skipped,
      chapters_failed: data.failed,
      elapsed_seconds: data.elapsed_seconds,
      message: `共 ${data.total} 章`,
    });
    setLastScriptFailedIds(data.failed_chapter_ids ?? []);
    await loadChapterStatuses();
    await loadScript();
    await loadLatestAnalysis();
    await loadLatestPlan();
    await loadLatestScriptReview();
  }

  async function runBatchTts(chapterIds?: string[]) {
    if (!selectedProjectId) return;
    setPipelineRun({
      label: chapterIds?.length ? "重跑失败音频" : "批量音频",
      status: "running",
      started_at: Date.now(),
      target_chapters: chapterIds?.length ?? chapters.length,
      message: "只处理已确认脚本",
    });
    const data = await api<BatchTTSResult>(
      `/projects/${selectedProjectId}/chapters/tts-batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skip_existing_success: !chapterIds?.length,
          ...(chapterIds?.length ? { chapter_ids: chapterIds } : {}),
        }),
      },
    );
    setPipelineRun({
      label: chapterIds?.length ? "重跑失败音频" : "批量音频",
      status: data.failed ? "failed" : "success",
      target_chapters: data.total,
      chapters_done: data.succeeded,
      chapters_skipped: data.skipped,
      chapters_failed: data.failed,
      elapsed_seconds: data.elapsed_seconds,
      message: `共 ${data.total} 章`,
    });
    setLastTtsFailedIds(data.failed_chapter_ids ?? []);
    await loadChapterStatuses();
    await loadLatestTtsTask();
    await loadTtsTasks();
  }

  async function runBuildFullAudio() {
    if (!selectedProjectId) return;
    setPipelineRun({ label: "合成全集", status: "running", started_at: Date.now() });
    const data = await api<FullAudioTask>(`/projects/${selectedProjectId}/audio/full`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allow_partial: false }),
    });
    setFullAudioTask(data);
    setPipelineRun({
      label: "合成全集",
      status: data.status === "success" ? "success" : "failed",
      chapters_done: data.chapters_included,
      chapters_failed: data.chapters_missing,
      message: formatBytes(data.output_bytes),
    });
  }

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
      setAnalysisReport(data.analysis);
      setPodcastPlan(data.plan);
      setScriptReview(data.review);
      setScriptBlocks(data.script_blocks);
      setPipelineRun({
        label: "LangGraph 脚本",
        status: data.error ? "failed" : "success",
        script_blocks: data.script_blocks.length,
        book_type: data.book_type,
        review_passed: data.review_passed,
        retry_count: data.retry_count,
        max_retries: data.max_retries,
        next_action: data.next_action,
        message: data.error ?? "analysis / plan / script / review 已编排",
      });
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

  async function confirmScript() {
    if (!selectedProjectId || !selectedChapterId) return;
    const data = await api<ScriptBlock[]>(
      `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script/confirm`,
      { method: "POST" },
    );
    setScriptBlocks(data);
    await loadChapterStatuses();
  }

  async function reviewScript() {
    if (!selectedProjectId || !selectedChapterId) return;
    const report = await api<JsonArtifact>(
      `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script-review`,
      { method: "POST" },
    );
    setScriptReview(report);
  }

  useEffect(() => {
    refreshProjects().catch((error) => setNotice(error.message));
  }, []);

  useEffect(() => {
    if (!pipelineRun || pipelineRun.status !== "running") return;
    const id = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [pipelineRun]);

  useEffect(() => {
    if (!selectedProjectId) {
      setChapters([]);
      setChapterStatuses({});
      setFullAudioTask(null);
      return;
    }
    setScriptDrawerOpen(false);
    setScriptBlocks([]);
    setAnalysisReport(null);
    setPodcastPlan(null);
    setScriptReview(null);
    setTtsTask(null);
    setTtsTasks([]);
    loadChapters(selectedProjectId).catch((error) => setNotice(error.message));
    loadChapterStatuses(selectedProjectId).catch((error) => setNotice(error.message));
    loadLatestFullAudio(selectedProjectId).catch((error) => setNotice(error.message));
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || !selectedChapterId) return;
    loadScript(selectedChapterId).catch((error) => {
      setScriptBlocks([]);
      setNotice(error.message);
    });
    loadLatestAnalysis(selectedChapterId).catch((error) => setNotice(error.message));
    loadLatestPlan(selectedChapterId).catch((error) => setNotice(error.message));
    loadLatestScriptReview(selectedChapterId).catch((error) => setNotice(error.message));
    loadLatestTtsTask(selectedChapterId).catch((error) => setNotice(error.message));
    loadTtsTasks(selectedChapterId).catch((error) => setNotice(error.message));
  }, [selectedChapterId, selectedProjectId]);

  const fullAudioHref =
    fullAudioTask?.status === "success"
      ? `${API_BASE}/projects/${selectedProjectId}/audio/full/${fullAudioTask.id}/file`
      : null;
  const selectedAudioHref =
    ttsTask?.status === "success"
      ? `${API_BASE}/projects/${selectedProjectId}/chapters/${selectedChapterId}/tts/tasks/${ttsTask.id}/audio`
      : "";

  return (
    <main className="workspace commandWorkspace">
      <header className="commandHeader">
        <ProjectSwitcher
          projects={projects}
          selectedProject={selectedProject}
          projectTitle={projectTitle}
          bookTitle={bookTitle}
          localPdfPath={localPdfPath}
          uploadInputRef={uploadInputRef}
          busy={Boolean(busy)}
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
          onParsePdf={parsePdf}
        />
        <div className="headerStatus">
          <span>{busy ? "运行中" : "空闲"}</span>
          <strong>{notice}</strong>
        </div>
        <button
          type="button"
          className="iconButton"
          onClick={() =>
            run("刷新项目", async () => {
              await refreshProjects();
              await loadChapterStatuses();
              await loadLatestFullAudio();
            })
          }
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      {pipelineRun && (
        <section className={`pipelineStatus ${pipelineRun.status}`} aria-label="任务进度">
          <div>
            <strong>{pipelineRun.label}</strong>
            <span>{pipelineRun.status === "running" ? "运行中" : pipelineRun.status === "success" ? "完成" : "失败"}</span>
          </div>
          <div className="pipelineMeta">
            {pipelineRun.script_blocks !== undefined && <span>{pipelineRun.script_blocks} 个脚本块</span>}
            {pipelineRun.target_chapters !== undefined && <span>目标 {pipelineRun.target_chapters} 章</span>}
            {pipelineRun.chapters_done !== undefined && <span>{pipelineRun.chapters_done} 章完成</span>}
            {pipelineRun.chapters_skipped !== undefined && <span>{pipelineRun.chapters_skipped} 章跳过</span>}
            {pipelineRun.chapters_failed !== undefined && <span>{pipelineRun.chapters_failed} 章失败</span>}
            {pipelineElapsed !== null && <span>耗时 {formatElapsed(pipelineElapsed)}</span>}
            {pipelineRun.book_type && <span>类型 {pipelineRun.book_type}</span>}
            {pipelineRun.review_passed !== undefined && <span>审核 {pipelineRun.review_passed ? "通过" : "待处理"}</span>}
            {pipelineRun.retry_count !== undefined && <span>重试 {pipelineRun.retry_count}/{pipelineRun.max_retries ?? 2}</span>}
            {pipelineRun.next_action && <span>下一步 {pipelineRun.next_action}</span>}
            {pipelineRun.message && <span>{pipelineRun.message}</span>}
          </div>
        </section>
      )}

      <div className="commandGrid">
        <BatchOverview
          summary={productionSummary}
          bookTitle={selectedProject?.book_title || selectedProject?.title || ""}
          chapterAudioBytes={formatBytes(chapterAudioBytes)}
        />
        <BatchPipeline
          summary={productionSummary}
          busy={Boolean(busy)}
          hasProject={Boolean(selectedProjectId)}
          hasChapters={Boolean(chapters.length)}
          audioExportHref={`${API_BASE}/projects/${selectedProjectId}/audio/chapters/export`}
          fullAudioHref={fullAudioHref}
          fullAudioReady={fullAudioTask?.status === "success"}
          lastScriptFailed={lastScriptFailedIds.length}
          lastTtsFailed={lastTtsFailedIds.length}
          onParsePdf={parsePdf}
          onBatchScript={() => run("批量 LangGraph 脚本", () => runBatchScript())}
          onRetryScript={() => run("重跑失败脚本", () => runBatchScript(lastScriptFailedIds))}
          onBatchTts={() => run("批量音频", () => runBatchTts())}
          onRetryTts={() => run("重跑失败音频", () => runBatchTts(lastTtsFailedIds))}
          onBuildFullAudio={() => run("合成全集", runBuildFullAudio)}
        />
      </div>

      <div className="commandBody">
        <ChapterQueue
          items={chapterQueueItems}
          busy={Boolean(busy)}
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

      <ChapterScriptDrawer
        open={scriptDrawerOpen}
        chapter={selectedChapter}
        scriptBlocks={scriptBlocks}
        analysisReport={analysisReport}
        podcastPlan={podcastPlan}
        scriptReview={scriptReview}
        ttsTask={ttsTask}
        ttsTasks={ttsTasks}
        audioSrc={selectedAudioHref}
        audioDownloadHref={selectedAudioHref}
        busy={Boolean(busy)}
        onClose={() => setScriptDrawerOpen(false)}
        onGenerateScript={() => selectedChapterId && generateScriptForChapter(selectedChapterId)}
        onReviewScript={() => run("审核脚本", reviewScript)}
        onConfirmScript={() => run("确认脚本", confirmScript)}
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
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

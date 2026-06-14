import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Check,
  Download,
  FileAudio,
  FileText,
  FolderOpen,
  GitMerge,
  ListChecks,
  Lock,
  PackageCheck,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Wand2,
  Unlock,
} from "lucide-react";
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

type ChapterReviewDraft = {
  title: string;
  start_page: string;
  end_page: string;
};

type NewChapterDraft = ChapterReviewDraft & {
  chapter_number: string;
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
  updated_at: string;
};

type ScriptPipelineResult = {
  analysis: JsonArtifact;
  plan: JsonArtifact;
  script_blocks: ScriptBlock[];
};

type PodcastPipelineResult = ScriptPipelineResult & {
  tts_task: TtsTask;
};

type BatchScriptResult = {
  project_id: string;
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  elapsed_seconds: number;
  failed_chapter_ids: string[];
  results: Array<{
    chapter_id: string;
    chapter_number: number;
    title: string;
    status: string;
    script_blocks: number;
    error_message: string | null;
  }>;
};

type BatchTTSResult = {
  project_id: string;
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  elapsed_seconds: number;
  failed_chapter_ids: string[];
  results: Array<{
    chapter_id: string;
    chapter_number: number;
    title: string;
    status: string;
    tts_task_id: string | null;
    rounds_finished: number;
    rounds_total: number;
    error_message: string | null;
  }>;
};

type FullAudioTask = {
  id: string;
  project_id: string;
  status: string;
  chapters_total: number;
  chapters_included: number;
  chapters_missing: number;
  output_path: string | null;
  output_bytes: number;
  error_message: string | null;
  created_at: string;
};

type PipelineRunState = {
  label: string;
  status: "running" | "success" | "failed";
  script_blocks?: number;
  target_chapters?: number;
  chapters_done?: number;
  chapters_failed?: number;
  chapters_skipped?: number;
  elapsed_seconds?: number;
  started_at?: number;
  tts_status?: string;
  rounds?: string;
  task_id?: string;
  message?: string;
};

type OcrDiagnostics = {
  configured_provider: string;
  language: string;
  dpi: number;
  pymupdf_available: boolean;
  pymupdf_ocr_api_available: boolean;
  tesseract_on_path: boolean;
  ready: boolean;
};

type ParseRun = {
  id: string;
  provider: string;
  source_type: string;
  status: string;
  pages: number;
  extracted_chars: number;
  quality_score: number;
  error_message: string | null;
  created_at: string;
};

type ChapterText = {
  chapter_id: string;
  title: string;
  text: string;
  chars: number;
  chars_no_whitespace: number;
  text_path: string | null;
};

type ChapterProductionStatus = {
  chapter_id: string;
  stage: string;
  has_analysis: boolean;
  has_plan: boolean;
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

function productionStageLabel(status?: ChapterProductionStatus) {
  if (!status) return "未开始";
  const labels: Record<string, string> = {
    not_started: "未开始",
    analyzed: "已分析",
    planned: "已策划",
    script_draft: "脚本待审",
    script_confirmed: "已确认",
    audio_running: "音频中",
    audio_failed: "音频失败",
    audio_success: "已出音频",
  };
  return labels[status.stage] ?? status.stage;
}

function productionStageClass(status?: ChapterProductionStatus) {
  return status ? `stageBadge ${status.stage}` : "stageBadge not_started";
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
  const [ocrDiagnostics, setOcrDiagnostics] = useState<OcrDiagnostics | null>(null);
  const [parseRun, setParseRun] = useState<ParseRun | null>(null);
  const [chapterText, setChapterText] = useState<ChapterText | null>(null);
  const [chapterStatuses, setChapterStatuses] = useState<Record<string, ChapterProductionStatus>>({});
  const [fullAudioTask, setFullAudioTask] = useState<FullAudioTask | null>(null);
  const [readerInsight, setReaderInsight] = useState<JsonArtifact | null>(null);
  const [bookProfile, setBookProfile] = useState<JsonArtifact | null>(null);
  const [readerInsightInput, setReaderInsightInput] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("准备就绪");
  const [pipelineRun, setPipelineRun] = useState<PipelineRunState | null>(null);
  const [lastScriptFailedIds, setLastScriptFailedIds] = useState<string[]>([]);
  const [lastTtsFailedIds, setLastTtsFailedIds] = useState<string[]>([]);
  const [clockTick, setClockTick] = useState(Date.now());
  const [projectTitle, setProjectTitle] = useState("Smoke Test");
  const [bookTitle, setBookTitle] = useState("");
  const [localPdfPath, setLocalPdfPath] = useState("");
  const [chapterDraft, setChapterDraft] = useState<ChapterReviewDraft>({
    title: "",
    start_page: "",
    end_page: "",
  });
  const [newChapterDraft, setNewChapterDraft] = useState<NewChapterDraft>({
    title: "",
    start_page: "",
    end_page: "",
    chapter_number: "",
  });
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedChapter = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId) ?? null,
    [chapters, selectedChapterId],
  );
  const lowConfidenceChapters = useMemo(
    () => chapters.filter((chapter) => chapter.confidence < 0.9),
    [chapters],
  );
  const chapterStatusSummary = useMemo(() => {
    const values = Object.values(chapterStatuses);
    return {
      scripted: values.filter((item) => item.script_blocks > 0).length,
      confirmed: values.filter(
        (item) => item.script_blocks > 0 && item.confirmed_blocks === item.script_blocks,
      ).length,
      audio: values.filter((item) => item.stage === "audio_success").length,
    };
  }, [chapterStatuses]);
  const chapterDeliverables = useMemo(
    () =>
      chapters.map((chapter) => ({
        chapter,
        status: chapterStatuses[chapter.id],
      })),
    [chapterStatuses, chapters],
  );
  const chapterAudioBytes = useMemo(
    () =>
      chapterDeliverables.reduce(
        (total, item) => total + (item.status?.latest_tts_output_bytes ?? 0),
        0,
      ),
    [chapterDeliverables],
  );
  const missingAudioChapters = useMemo(
    () =>
      chapterDeliverables.filter(
        (item) => item.status?.latest_tts_status !== "success",
      ),
    [chapterDeliverables],
  );
  const selectedChapterStatus = selectedChapterId ? chapterStatuses[selectedChapterId] : undefined;
  const projectCompletion = useMemo(() => {
    if (!chapters.length) return 0;
    return Math.round((chapterStatusSummary.audio / chapters.length) * 100);
  }, [chapterStatusSummary.audio, chapters.length]);
  const nextAction = useMemo(() => {
    if (!selectedProjectId) return "先创建或选择一个项目";
    if (!chapters.length) return "导入 PDF 后点击解析";
    if (lowConfidenceChapters.length) return "先检查低置信章节标题和页码";
    if (chapterStatusSummary.scripted < chapters.length) return "批量生成缺失章节脚本";
    if (chapterStatusSummary.confirmed < chapters.length) return "审核并确认章节脚本";
    if (chapterStatusSummary.audio < chapters.length) return "批量生成已确认章节音频";
    if (fullAudioTask?.status !== "success") return "合成全集 MP3";
    return "导出分章 ZIP 或全集 MP3";
  }, [
    chapterStatusSummary.audio,
    chapterStatusSummary.confirmed,
    chapterStatusSummary.scripted,
    chapters.length,
    fullAudioTask?.status,
    lowConfidenceChapters.length,
    selectedProjectId,
  ]);
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
      if (label === "生成单章播客" || label === "真实API脚本") {
        setPipelineRun({ label, status: "failed", message });
      }
    } finally {
      setBusy("");
    }
  }

  async function runBatchScript() {
    setPipelineRun({
      label: "批量脚本",
      status: "running",
      target_chapters: chapters.length,
      started_at: Date.now(),
      message: "跳过已有脚本，只生成缺少脚本的章节",
    });
    const data = await api<BatchScriptResult>(
      `/projects/${selectedProjectId}/chapters/script-batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip_existing: true }),
      },
    );
    setPipelineRun({
      label: "批量脚本",
      status: data.failed ? "failed" : "success",
      target_chapters: data.total,
      chapters_done: data.succeeded,
      chapters_skipped: data.skipped,
      chapters_failed: data.failed,
      elapsed_seconds: data.elapsed_seconds,
      message: `共 ${data.total} 章`,
    });
    setLastScriptFailedIds(data.failed_chapter_ids ?? []);
    if (data.failed) {
      setNotice(`批量脚本部分失败：${data.failed} 章`);
    }
    await loadChapterStatuses();
    await loadLatestAnalysis();
    await loadLatestPlan();
    await loadScript();
  }

  async function runBatchTts() {
    setPipelineRun({
      label: "批量音频",
      status: "running",
      target_chapters: chapters.length,
      started_at: Date.now(),
      message: "只处理已确认脚本的章节",
    });
    const data = await api<BatchTTSResult>(
      `/projects/${selectedProjectId}/chapters/tts-batch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip_existing_success: true }),
      },
    );
    setPipelineRun({
      label: "批量音频",
      status: data.failed ? "failed" : "success",
      target_chapters: data.total,
      chapters_done: data.succeeded,
      chapters_skipped: data.skipped,
      chapters_failed: data.failed,
      elapsed_seconds: data.elapsed_seconds,
      message: `共 ${data.total} 章`,
    });
    setLastTtsFailedIds(data.failed_chapter_ids ?? []);
    if (data.failed) {
      setNotice(`批量音频部分失败：${data.failed} 章`);
    }
    await loadChapterStatuses();
    await loadLatestTtsTask();
    await loadTtsTasks();
  }

  async function runBuildFullAudio() {
    setPipelineRun({
      label: "合成全集",
      status: "running",
      message: "按章节顺序合并 MP3",
    });
    const data = await api<FullAudioTask>(
      `/projects/${selectedProjectId}/audio/full`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow_partial: false }),
      },
    );
    setFullAudioTask(data);
    setPipelineRun({
      label: "合成全集",
      status: data.status === "success" ? "success" : "failed",
      chapters_done: data.chapters_included,
      chapters_failed: data.chapters_missing,
      message: formatBytes(data.output_bytes),
    });
  }

  async function refreshProjects() {
    const data = await api<Project[]>("/projects");
    setProjects(data);
    const currentStillExists = data.some((item) => item.id === selectedProjectId);
    if (!currentStillExists) {
      const preferred = data.find((item) => item.status === "parsed") ?? data[0];
      if (preferred) setSelectedProjectId(preferred.id);
    }
  }

  async function loadChapters(projectId = selectedProjectId) {
    if (!projectId) return;
    const data = await api<Chapter[]>(`/projects/${projectId}/chapters`);
    setChapters(data);
    const currentStillExists = data.some((item) => item.id === selectedChapterId);
    if (!currentStillExists) {
      setSelectedChapterId(data[0]?.id ?? "");
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
    setChapterStatuses(
      Object.fromEntries(data.map((item) => [item.chapter_id, item])),
    );
  }

  async function loadLatestParseRun(projectId = selectedProjectId) {
    if (!projectId) return;
    const latest = await optionalApi<ParseRun>(`/projects/${projectId}/parse-runs/latest`);
    setParseRun(latest);
  }

  async function saveChapterReview() {
    if (!selectedProjectId || !selectedChapterId) return;
    const startPage = Number(chapterDraft.start_page);
    const endPage = Number(chapterDraft.end_page);
    if (!chapterDraft.title.trim()) throw new Error("章节标题不能为空");
    if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) {
      throw new Error("起止页码必须是整数");
    }
    const updated = await api<Chapter>(
      `/projects/${selectedProjectId}/chapters/${selectedChapterId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: chapterDraft.title,
          start_page: startPage,
          end_page: endPage,
        }),
      },
    );
    setChapters((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    await loadChapterStatuses();
  }

  async function addManualChapter() {
    if (!selectedProjectId) return;
    const startPage = Number(newChapterDraft.start_page);
    const endPage = Number(newChapterDraft.end_page);
    const chapterNumber = newChapterDraft.chapter_number
      ? Number(newChapterDraft.chapter_number)
      : undefined;
    if (!newChapterDraft.title.trim()) throw new Error("新增章节标题不能为空");
    if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) {
      throw new Error("新增章节页码必须是整数");
    }
    if (chapterNumber !== undefined && !Number.isInteger(chapterNumber)) {
      throw new Error("插入位置必须是整数");
    }
    const created = await api<Chapter>(`/projects/${selectedProjectId}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newChapterDraft.title,
        start_page: startPage,
        end_page: endPage,
        chapter_number: chapterNumber,
      }),
    });
    await loadChapters();
    await loadChapterStatuses();
    setSelectedChapterId(created.id);
    setNewChapterDraft({ title: "", start_page: "", end_page: "", chapter_number: "" });
  }

  async function deleteSelectedChapter() {
    if (!selectedProjectId || !selectedChapter) return;
    if (!window.confirm(`删除第 ${selectedChapter.chapter_number} 章：${selectedChapter.title}？`)) return;
    const data = await api<Chapter[]>(
      `/projects/${selectedProjectId}/chapters/${selectedChapter.id}`,
      { method: "DELETE" },
    );
    setChapters(data);
    await loadChapterStatuses();
    setSelectedChapterId(data[0]?.id ?? "");
  }

  async function mergeSelectedWithNext() {
    if (!selectedProjectId || !selectedChapter) return;
    const currentIndex = chapters.findIndex((chapter) => chapter.id === selectedChapter.id);
    const nextChapter = chapters[currentIndex + 1];
    if (!nextChapter) throw new Error("最后一章不能继续向后合并");
    if (
      !window.confirm(
        `合并第 ${selectedChapter.chapter_number} 章和第 ${nextChapter.chapter_number} 章？`,
      )
    ) {
      return;
    }
    const merged = await api<Chapter>(
      `/projects/${selectedProjectId}/chapters/${selectedChapter.id}/merge-next`,
      { method: "POST" },
    );
    await loadChapters();
    await loadChapterStatuses();
    setSelectedChapterId(merged.id);
  }

  async function loadChapterText(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) return;
    const data = await api<ChapterText>(
      `/projects/${selectedProjectId}/chapters/${chapterId}/text`,
    );
    setChapterText(data);
  }

  async function loadScript(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) return;
    const data = await api<ScriptBlock[]>(
      `/projects/${selectedProjectId}/chapters/${chapterId}/script-blocks`,
    );
    setScriptBlocks(data);
  }

  async function loadLatestAnalysis(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) return;
    const artifact = await optionalApi<JsonArtifact>(
      `/projects/${selectedProjectId}/chapters/${chapterId}/analysis/latest`,
    );
    setAnalysisReport(artifact);
  }

  async function loadLatestPlan(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) return;
    const artifact = await optionalApi<JsonArtifact>(
      `/projects/${selectedProjectId}/chapters/${chapterId}/plan/latest`,
    );
    setPodcastPlan(artifact);
  }

  async function loadLatestScriptReview(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) return;
    const artifact = await optionalApi<JsonArtifact>(
      `/projects/${selectedProjectId}/chapters/${chapterId}/script-review/latest`,
    );
    setScriptReview(artifact);
  }

  async function loadLatestTtsTask(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) return;
    const response = await fetch(
      `${API_BASE}/projects/${selectedProjectId}/chapters/${chapterId}/tts/tasks/latest`,
    );
    if (response.status === 404) {
      setTtsTask(null);
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail ?? `请求失败：${response.status}`);
    }
    setTtsTask((await response.json()) as TtsTask);
  }

  async function loadTtsTasks(chapterId = selectedChapterId) {
    if (!selectedProjectId || !chapterId) return;
    const data = await api<TtsTask[]>(
      `/projects/${selectedProjectId}/chapters/${chapterId}/tts/tasks`,
    );
    setTtsTasks(data);
  }

  async function loadLatestFullAudio(projectId = selectedProjectId) {
    if (!projectId) {
      setFullAudioTask(null);
      return;
    }
    const latest = await optionalApi<FullAudioTask>(`/projects/${projectId}/audio/full/latest`);
    setFullAudioTask(latest);
  }

  async function loadLatestReaderInsight(projectId = selectedProjectId) {
    if (!projectId) {
      setReaderInsight(null);
      return;
    }
    const latest = await optionalApi<JsonArtifact>(`/projects/${projectId}/reader-insight/latest`);
    setReaderInsight(latest);
  }

  async function loadLatestBookProfile(projectId = selectedProjectId) {
    if (!projectId) {
      setBookProfile(null);
      return;
    }
    const latest = await optionalApi<JsonArtifact>(`/projects/${projectId}/book-profile/latest`);
    setBookProfile(latest);
  }

  useEffect(() => {
    refreshProjects().catch((error) => setNotice(error.message));
    api<OcrDiagnostics>("/ocr/diagnostics")
      .then(setOcrDiagnostics)
      .catch((error) => setNotice(error.message));
  }, []);

  useEffect(() => {
    if (pipelineRun?.status !== "running") return;
    const timer = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pipelineRun?.status]);

  useEffect(() => {
    setChapters([]);
    setScriptBlocks([]);
    setTtsTask(null);
    setTtsTasks([]);
    setAnalysisReport(null);
    setPodcastPlan(null);
    setParseRun(null);
    setChapterStatuses({});
    setFullAudioTask(null);
    setReaderInsight(null);
    setBookProfile(null);
    if (selectedProjectId) loadChapters(selectedProjectId).catch((error) => setNotice(error.message));
    if (selectedProjectId) loadChapterStatuses(selectedProjectId).catch((error) => setNotice(error.message));
    if (selectedProjectId) loadLatestParseRun(selectedProjectId).catch((error) => setNotice(error.message));
    if (selectedProjectId) loadLatestFullAudio(selectedProjectId).catch((error) => setNotice(error.message));
    if (selectedProjectId) loadLatestReaderInsight(selectedProjectId).catch((error) => setNotice(error.message));
    if (selectedProjectId) loadLatestBookProfile(selectedProjectId).catch((error) => setNotice(error.message));
  }, [selectedProjectId]);

  useEffect(() => {
    setScriptBlocks([]);
    setTtsTask(null);
    setTtsTasks([]);
    setAnalysisReport(null);
    setPodcastPlan(null);
    setScriptReview(null);
    setChapterText(null);
    if (selectedChapterId) {
      loadChapterText(selectedChapterId).catch((error) => setNotice(error.message));
      loadScript(selectedChapterId).catch((error) => setNotice(error.message));
      loadLatestAnalysis(selectedChapterId).catch((error) => setNotice(error.message));
      loadLatestPlan(selectedChapterId).catch((error) => setNotice(error.message));
      loadLatestScriptReview(selectedChapterId).catch((error) => setNotice(error.message));
      loadLatestTtsTask(selectedChapterId).catch((error) => setNotice(error.message));
      loadTtsTasks(selectedChapterId).catch((error) => setNotice(error.message));
    }
  }, [selectedChapterId]);

  useEffect(() => {
    setChapterDraft({
      title: selectedChapter?.title ?? "",
      start_page: selectedChapter ? String(selectedChapter.start_page) : "",
      end_page: selectedChapter ? String(selectedChapter.end_page) : "",
    });
  }, [selectedChapter]);

  return (
    <main className="workspace">
      <header className="appHeader">
        <div>
          <h1>微信读书播客工作台</h1>
          <p>v0.1 单章真实闭环：PDF 解析、DeepSeek 脚本、火山/豆包 TTS。</p>
        </div>
        <button
          type="button"
          className="iconButton"
          onClick={() =>
            run("刷新项目", async () => {
              await refreshProjects();
              await loadChapterStatuses();
            })
          }
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      <section className="statusLine" role="status">
        <span>{busy ? "运行中" : "空闲"}</span>
        <strong>{notice}</strong>
      </section>

      <section className="projectDashboard" aria-label="项目总览">
        <div className="projectIdentity">
          <span>当前项目</span>
          <strong>{selectedProject?.book_title || selectedProject?.title || "尚未选择项目"}</strong>
          <small>{nextAction}</small>
        </div>
        <div className="progressBlock">
          <div className="progressHeader">
            <span>音频完成度</span>
            <strong>{projectCompletion}%</strong>
          </div>
          <div className="progressTrack" aria-label={`音频完成度 ${projectCompletion}%`}>
            <div style={{ width: `${projectCompletion}%` }} />
          </div>
        </div>
        <div className="dashboardStats">
          <div>
            <strong>{chapters.length}</strong>
            <span>章节</span>
          </div>
          <div>
            <strong>{chapterStatusSummary.scripted}</strong>
            <span>脚本</span>
          </div>
          <div>
            <strong>{chapterStatusSummary.audio}</strong>
            <span>音频</span>
          </div>
          <div className={lowConfidenceChapters.length ? "riskStat" : ""}>
            <strong>{lowConfidenceChapters.length}</strong>
            <span>待查</span>
          </div>
        </div>
      </section>

      <div className="layout">
        <aside className="panel sidebar">
          <div className="panelTitle">
            <FolderOpen size={17} />
            <h2>项目</h2>
          </div>
          <label>
            项目名
            <input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} />
          </label>
          <label>
            书名
            <input value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} />
          </label>
          <button
            type="button"
            onClick={() =>
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
          >
            创建项目
          </button>

          <div className="projectList" aria-label="历史项目">
            {projects.map((project) => (
              <button
                type="button"
                className={project.id === selectedProjectId ? "project active" : "project"}
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <strong>{project.book_title || project.title}</strong>
                <span>{project.status}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel flow">
          <div className="panelTitle">
            <FileText size={17} />
            <h2>输入与章节</h2>
          </div>

          <div className="projectMeta">
            <span>{selectedProject ? selectedProject.id : "未选择项目"}</span>
            <strong>{selectedProject?.book_title || selectedProject?.title || "请选择项目"}</strong>
          </div>

          <div className={ocrDiagnostics?.ready ? "ocrStatus ready" : "ocrStatus"}>
            <strong>OCR</strong>
            <span>
              {ocrDiagnostics
                ? `${ocrDiagnostics.configured_provider} · ${ocrDiagnostics.language} · ${ocrDiagnostics.ready ? "ready" : "not ready"}`
                : "检测中"}
            </span>
          </div>

          <div className="toolbar">
            <label className="wide">
              本地 PDF 路径
              <input
                value={localPdfPath}
                placeholder="E:\\codex\\...\\book.pdf"
                onChange={(event) => setLocalPdfPath(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!selectedProjectId || !localPdfPath}
              onClick={() =>
                run("导入 PDF", async () => {
                  await api<Project>(`/projects/${selectedProjectId}/pdf/local`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pdf_path: localPdfPath }),
                  });
                  await refreshProjects();
                })
              }
            >
              <Upload size={16} />
              导入
            </button>
            <button
              type="button"
              disabled={!selectedProjectId}
              onClick={() =>
                run("解析 PDF", async () => {
                  await api(`/projects/${selectedProjectId}/parse`, { method: "POST" });
                  await loadChapters();
                  await loadChapterStatuses();
                  await loadLatestParseRun();
                })
              }
            >
              <Play size={16} />
              解析
            </button>
          </div>

          <div className="toolbar uploadBar">
            <label className="wide">
              上传 PDF
              <input ref={uploadInputRef} type="file" accept="application/pdf,.pdf" />
            </label>
            <button
              type="button"
              disabled={!selectedProjectId}
              onClick={() =>
                run("上传 PDF", async () => {
                  const file = uploadInputRef.current?.files?.[0];
                  if (!file) throw new Error("请选择 PDF 文件");
                  const form = new FormData();
                  form.append("file", file);
                  await api<Project>(`/projects/${selectedProjectId}/pdf/upload`, {
                    method: "POST",
                    body: form,
                  });
                  await refreshProjects();
                })
              }
            >
              <Upload size={16} />
              上传
            </button>
          </div>

          <div className="productionSummary">
            <div>
              <strong>{chapterStatusSummary.scripted}</strong>
              <span>已有脚本</span>
            </div>
            <div>
              <strong>{chapterStatusSummary.confirmed}</strong>
              <span>已确认</span>
            </div>
            <div>
              <strong>{chapterStatusSummary.audio}</strong>
              <span>已出音频</span>
            </div>
          </div>

          <div className="chapterList" aria-label="章节列表">
            {chapters.map((chapter) => {
              const status = chapterStatuses[chapter.id];
              return (
                <button
                  type="button"
                  className={chapter.id === selectedChapterId ? "chapter active" : "chapter"}
                  key={chapter.id}
                  onClick={() => setSelectedChapterId(chapter.id)}
                >
                  <div className="chapterTopline">
                    <span>第 {chapter.chapter_number} 章</span>
                    <span className={productionStageClass(status)}>
                      {productionStageLabel(status)}
                    </span>
                  </div>
                  <strong>{chapter.title}</strong>
                  <small>
                    {chapter.start_page}-{chapter.end_page} 页 · {chapter.chars_no_whitespace} 字
                  </small>
                  <small>
                    {chapter.source} · {Math.round(chapter.confidence * 100)}%
                    {status?.script_blocks ? ` · ${status.confirmed_blocks}/${status.script_blocks} 脚本` : ""}
                    {status?.rounds_total ? ` · ${status.rounds_finished}/${status.rounds_total} 音频` : ""}
                  </small>
                </button>
              );
            })}
          </div>

          <div className="qualityPanel">
            <div className="sectionHeader">
              <strong>内容质量</strong>
              <span>{bookProfile ? "书籍画像已生成" : readerInsight ? "读者洞察已生成" : "可选增强"}</span>
            </div>
            <label>
              评论 / 笔记 / 划线
              <textarea
                value={readerInsightInput}
                placeholder="可粘贴高赞评论、个人读书笔记、划线摘录；留空也可以生成 empty_input 洞察。"
                onChange={(event) => setReaderInsightInput(event.target.value)}
              />
            </label>
            <div className="qualityActions">
              <button
                type="button"
                disabled={!selectedProjectId}
                onClick={() =>
                  run("生成读者洞察", async () => {
                    const insight = await api<JsonArtifact>(
                      `/projects/${selectedProjectId}/reader-insight`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ input_text: readerInsightInput }),
                      },
                    );
                    setReaderInsight(insight);
                  })
                }
              >
                <Wand2 size={16} />
                读者洞察
              </button>
              <button
                type="button"
                disabled={!selectedProjectId}
                onClick={() =>
                  run("生成书籍画像", async () => {
                    const profile = await api<JsonArtifact>(
                      `/projects/${selectedProjectId}/book-profile`,
                      { method: "POST" },
                    );
                    setBookProfile(profile);
                  })
                }
              >
                <Wand2 size={16} />
                书籍画像
              </button>
            </div>
            <div className="artifactGrid compactArtifacts">
              <details className="artifact" open={Boolean(readerInsight)}>
                <summary>
                  <span>读者洞察</span>
                  <small>{readerInsight ? readerInsight.status : "未生成"}</small>
                </summary>
                {readerInsight ? (
                  <pre>{JSON.stringify(readerInsight.content_json, null, 2)}</pre>
                ) : (
                  <p>暂无读者洞察</p>
                )}
              </details>
              <details className="artifact" open={Boolean(bookProfile)}>
                <summary>
                  <span>书籍画像</span>
                  <small>{bookProfile ? bookProfile.status : "未生成"}</small>
                </summary>
                {bookProfile ? (
                  <pre>{JSON.stringify(bookProfile.content_json, null, 2)}</pre>
                ) : (
                  <p>暂无书籍画像</p>
                )}
              </details>
            </div>
          </div>

          <div className="chapterReview">
            <div className="sectionHeader">
              <strong>目录确认</strong>
              <span>{chapters.length ? `${chapters.length} 章待验收` : "暂无章节"}</span>
            </div>
            <div className="parseSummary">
              <div>
                <strong>{parseRun?.provider ?? "未解析"}</strong>
                <span>{parseRun ? `${parseRun.source_type} · ${parseRun.status}` : "暂无解析报告"}</span>
              </div>
              <div>
                <strong>{parseRun ? `${parseRun.pages} 页` : "0 页"}</strong>
                <span>{parseRun ? `${parseRun.extracted_chars} 字 · 质量 ${Math.round(parseRun.quality_score * 100)}%` : "等待 PDF 解析"}</span>
              </div>
              <div>
                <strong>{lowConfidenceChapters.length}</strong>
                <span>低置信章节</span>
              </div>
            </div>
            {(lowConfidenceChapters.length > 0 || parseRun?.source_type?.includes("ocr")) && (
              <div className="riskNotice">
                <AlertTriangle size={16} />
                <span>
                  {lowConfidenceChapters.length > 0
                    ? `${lowConfidenceChapters.length} 个章节建议先核对标题和页码`
                    : "OCR 解析结果建议人工抽查目录"}
                </span>
              </div>
            )}
            <div className="reviewForm">
              <label>
                章节标题
                <input
                  value={chapterDraft.title}
                  disabled={!selectedChapter}
                  onChange={(event) =>
                    setChapterDraft((draft) => ({ ...draft, title: event.target.value }))
                  }
                />
              </label>
              <div className="pageFields">
                <label>
                  起始页
                  <input
                    inputMode="numeric"
                    value={chapterDraft.start_page}
                    disabled={!selectedChapter}
                    onChange={(event) =>
                      setChapterDraft((draft) => ({ ...draft, start_page: event.target.value }))
                    }
                  />
                </label>
                <label>
                  结束页
                  <input
                    inputMode="numeric"
                    value={chapterDraft.end_page}
                    disabled={!selectedChapter}
                    onChange={(event) =>
                      setChapterDraft((draft) => ({ ...draft, end_page: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="reviewMeta">
                <span>{selectedChapter ? `来源：${selectedChapter.source}` : "未选择章节"}</span>
                <span>
                  {selectedChapter
                    ? `置信度：${Math.round(selectedChapter.confidence * 100)}%`
                    : "请选择左侧章节"}
                </span>
              </div>
              <p className="chapterPreview">
                {selectedChapter?.preview || "解析后可在这里快速检查章节正文预览。"}
              </p>
              <details className="chapterTextPanel" open>
                <summary>
                  <span>章节正文</span>
                  <small>
                    {chapterText
                      ? `${chapterText.chars_no_whitespace} 字 · ${chapterText.chars} 字符`
                      : "加载中"}
                  </small>
                </summary>
                <div className="chapterTextMeta">
                  <span>{chapterText?.text_path || "暂无正文路径"}</span>
                  <button
                    type="button"
                    className="ghostButton"
                    disabled={!chapterText}
                    onClick={() =>
                      run("刷新章节正文", async () => {
                        await loadChapterText();
                      })
                    }
                  >
                    刷新正文
                  </button>
                </div>
                <pre>{chapterText?.text || "选择章节后显示完整正文。"}</pre>
              </details>
              <button
                type="button"
                disabled={!selectedChapter}
                onClick={() => run("保存章节验收", saveChapterReview)}
              >
                <Check size={16} />
                保存验收
              </button>
            </div>

            <div className="structureTools">
              <div className="sectionHeader compactHeader">
                <strong>结构操作</strong>
                <span>新增、删除或合并误识别章节</span>
              </div>
              <div className="structureButtons">
                <button
                  type="button"
                  className="ghostButton"
                  disabled={!selectedChapter || chapters.length < 2}
                  onClick={() => run("合并下一章", mergeSelectedWithNext)}
                >
                  <GitMerge size={16} />
                  合并下一章
                </button>
                <button
                  type="button"
                  className="dangerButton"
                  disabled={!selectedChapter}
                  onClick={() => run("删除章节", deleteSelectedChapter)}
                >
                  <Trash2 size={16} />
                  删除章节
                </button>
              </div>
              <div className="newChapterForm">
                <label className="wide">
                  新增章节标题
                  <input
                    value={newChapterDraft.title}
                    disabled={!selectedProject}
                    onChange={(event) =>
                      setNewChapterDraft((draft) => ({ ...draft, title: event.target.value }))
                    }
                  />
                </label>
                <label>
                  插入为第几章
                  <input
                    inputMode="numeric"
                    placeholder={`${chapters.length + 1}`}
                    value={newChapterDraft.chapter_number}
                    disabled={!selectedProject}
                    onChange={(event) =>
                      setNewChapterDraft((draft) => ({
                        ...draft,
                        chapter_number: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  起始页
                  <input
                    inputMode="numeric"
                    value={newChapterDraft.start_page}
                    disabled={!selectedProject}
                    onChange={(event) =>
                      setNewChapterDraft((draft) => ({ ...draft, start_page: event.target.value }))
                    }
                  />
                </label>
                <label>
                  结束页
                  <input
                    inputMode="numeric"
                    value={newChapterDraft.end_page}
                    disabled={!selectedProject}
                    onChange={(event) =>
                      setNewChapterDraft((draft) => ({ ...draft, end_page: event.target.value }))
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={!selectedProject}
                  onClick={() => run("新增章节", addManualChapter)}
                >
                  <Plus size={16} />
                  新增章节
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel scriptPanel">
          <div className="panelTitle">
            <Wand2 size={17} />
            <h2>单章生产</h2>
          </div>

          <div className="chapterMeta">
            <strong>{selectedChapter?.title || "未选择章节"}</strong>
            <span>
              {selectedChapterStatus
                ? `${productionStageLabel(selectedChapterStatus)} · ${scriptBlocks.length} 个脚本块`
                : `${scriptBlocks.length} 个脚本块`}
            </span>
          </div>

          <div className="workflowQuickStart" aria-label="主流程">
            <article>
              <div>
                <ListChecks size={18} />
                <strong>1. 生成整书脚本</strong>
              </div>
              <p>跳过已有脚本，只补缺失章节。</p>
              <button
                type="button"
                disabled={!selectedProjectId || !chapters.length}
                onClick={() => run("批量脚本", runBatchScript)}
              >
                <Wand2 size={16} />
                批量脚本
              </button>
            </article>
            <article>
              <div>
                <FileAudio size={18} />
                <strong>2. 生成分章音频</strong>
              </div>
              <p>只处理已经确认的章节脚本。</p>
              <button
                type="button"
                disabled={!selectedProjectId || !chapters.length}
                onClick={() => run("批量音频", runBatchTts)}
              >
                <FileAudio size={16} />
                批量音频
              </button>
            </article>
            <article>
              <div>
                <PackageCheck size={18} />
                <strong>3. 合成全集</strong>
              </div>
              <p>按章节顺序合并已生成的 MP3。</p>
              <button
                type="button"
                disabled={!selectedProjectId || !chapterStatusSummary.audio}
                onClick={() => run("合成全集", runBuildFullAudio)}
              >
                <PackageCheck size={16} />
                合成全集
              </button>
            </article>
            <article>
              <div>
                <Download size={18} />
                <strong>4. 导出交付</strong>
              </div>
              <p>
                {fullAudioTask?.status === "success"
                  ? `全集 ${formatBytes(fullAudioTask.output_bytes)} 已就绪`
                  : `${chapterStatusSummary.audio} 个分章 MP3 可导出`}
              </p>
              <a
                className={chapterStatusSummary.audio ? "primaryLinkButton" : "primaryLinkButton disabled"}
                href={`${API_BASE}/projects/${selectedProjectId}/audio/chapters/export`}
                download
                aria-disabled={!chapterStatusSummary.audio}
              >
                导出 ZIP
              </a>
            </article>
          </div>

          <details className="advancedActions">
            <summary>
              <span>高级操作</span>
              <small>单章分析、失败重跑、脚本审核和 TTS 调试入口</small>
            </summary>
            <div className="toolbar compact">
            <button
              type="button"
              disabled={!selectedProjectId || !chapters.length}
              onClick={() =>
                run("批量脚本", async () => {
                  setPipelineRun({
                    label: "批量脚本",
                    status: "running",
                    target_chapters: chapters.length,
                    started_at: Date.now(),
                    message: "跳过已有脚本，只生成缺少脚本的章节",
                  });
                  const data = await api<BatchScriptResult>(
                    `/projects/${selectedProjectId}/chapters/script-batch`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ skip_existing: true }),
                    },
                  );
                  setPipelineRun({
                    label: "批量脚本",
                    status: data.failed ? "failed" : "success",
                    target_chapters: data.total,
                    chapters_done: data.succeeded,
                    chapters_skipped: data.skipped,
                    chapters_failed: data.failed,
                    elapsed_seconds: data.elapsed_seconds,
                    message: `共 ${data.total} 章`,
                  });
                  setLastScriptFailedIds(data.failed_chapter_ids ?? []);
                  if (data.failed) {
                    setNotice(`批量脚本部分失败：${data.failed} 章`);
                  }
                  await loadChapterStatuses();
                  await loadLatestAnalysis();
                  await loadLatestPlan();
                  await loadScript();
                })
              }
            >
              <Wand2 size={16} />
              批量脚本
            </button>
            <button
              type="button"
              disabled={!selectedProjectId || !lastScriptFailedIds.length}
              onClick={() =>
                run("重跑失败脚本", async () => {
                  setPipelineRun({
                    label: "重跑失败脚本",
                    status: "running",
                    target_chapters: lastScriptFailedIds.length,
                    started_at: Date.now(),
                    message: "只处理上次失败的脚本章节",
                  });
                  const data = await api<BatchScriptResult>(
                    `/projects/${selectedProjectId}/chapters/script-batch`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        skip_existing: false,
                        chapter_ids: lastScriptFailedIds,
                      }),
                    },
                  );
                  setPipelineRun({
                    label: "重跑失败脚本",
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
                  await loadLatestAnalysis();
                  await loadLatestPlan();
                  await loadScript();
                })
              }
            >
              <RefreshCw size={16} />
              重跑失败脚本
            </button>
            <button
              type="button"
              disabled={!selectedProjectId || !chapters.length}
              onClick={() =>
                run("批量音频", async () => {
                  setPipelineRun({
                    label: "批量音频",
                    status: "running",
                    target_chapters: chapters.length,
                    started_at: Date.now(),
                    message: "只处理已确认脚本的章节",
                  });
                  const data = await api<BatchTTSResult>(
                    `/projects/${selectedProjectId}/chapters/tts-batch`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ skip_existing_success: true }),
                    },
                  );
                  setPipelineRun({
                    label: "批量音频",
                    status: data.failed ? "failed" : "success",
                    target_chapters: data.total,
                    chapters_done: data.succeeded,
                    chapters_skipped: data.skipped,
                    chapters_failed: data.failed,
                    elapsed_seconds: data.elapsed_seconds,
                    message: `共 ${data.total} 章`,
                  });
                  setLastTtsFailedIds(data.failed_chapter_ids ?? []);
                  if (data.failed) {
                    setNotice(`批量音频部分失败：${data.failed} 章`);
                  }
                  await loadChapterStatuses();
                  await loadLatestTtsTask();
                  await loadTtsTasks();
                })
              }
            >
              <FileAudio size={16} />
              批量音频
            </button>
            <button
              type="button"
              disabled={!selectedProjectId || !lastTtsFailedIds.length}
              onClick={() =>
                run("重跑失败音频", async () => {
                  setPipelineRun({
                    label: "重跑失败音频",
                    status: "running",
                    target_chapters: lastTtsFailedIds.length,
                    started_at: Date.now(),
                    message: "只处理上次失败的音频章节",
                  });
                  const data = await api<BatchTTSResult>(
                    `/projects/${selectedProjectId}/chapters/tts-batch`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        skip_existing_success: false,
                        chapter_ids: lastTtsFailedIds,
                      }),
                    },
                  );
                  setPipelineRun({
                    label: "重跑失败音频",
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
                })
              }
            >
              <RefreshCw size={16} />
              重跑失败音频
            </button>
            <button
              type="button"
              disabled={!selectedProjectId || !chapterStatusSummary.audio}
              onClick={() =>
                run("合成全集", async () => {
                  setPipelineRun({
                    label: "合成全集",
                    status: "running",
                    message: "按章节顺序合并 MP3",
                  });
                  const data = await api<FullAudioTask>(
                    `/projects/${selectedProjectId}/audio/full`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ allow_partial: false }),
                    },
                  );
                  setFullAudioTask(data);
                  setPipelineRun({
                    label: "合成全集",
                    status: data.status === "success" ? "success" : "failed",
                    chapters_done: data.chapters_included,
                    chapters_failed: data.chapters_missing,
                    message: `${Math.round(data.output_bytes / 1024 / 1024 * 10) / 10} MB`,
                  });
                })
              }
            >
              <FileAudio size={16} />
              合成全集
            </button>
            <button
              type="button"
              disabled={!selectedChapterId}
              onClick={() =>
                run("生成单章播客", async () => {
                  setPipelineRun({ label: "生成单章播客", status: "running", message: "真实 API 处理中" });
                  const data = await api<PodcastPipelineResult>(
                    `/projects/${selectedProjectId}/chapters/${selectedChapterId}/podcast-pipeline`,
                    { method: "POST" },
                  );
                  setAnalysisReport(data.analysis);
                  setPodcastPlan(data.plan);
                  setScriptBlocks(data.script_blocks);
                  setTtsTask(data.tts_task);
                  setPipelineRun({
                    label: "生成单章播客",
                    status: "success",
                    script_blocks: data.script_blocks.length,
                    tts_status: data.tts_task.status,
                    rounds: `${data.tts_task.rounds_finished}/${data.tts_task.rounds_total}`,
                    task_id: data.tts_task.id,
                  });
                  await loadTtsTasks();
                  await loadChapterStatuses();
                })
              }
            >
              <FileAudio size={16} />
              生成单章播客
            </button>
            <button
              type="button"
              disabled={!selectedChapterId}
              onClick={() =>
                run("真实API脚本", async () => {
                  setPipelineRun({ label: "真实API脚本", status: "running", message: "DeepSeek 处理中" });
                  const data = await api<ScriptPipelineResult>(
                    `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script-pipeline`,
                    { method: "POST" },
                  );
                  setAnalysisReport(data.analysis);
                  setPodcastPlan(data.plan);
                  setScriptBlocks(data.script_blocks);
                  setPipelineRun({
                    label: "真实API脚本",
                    status: "success",
                    script_blocks: data.script_blocks.length,
                    message: "analysis / plan / script 已生成",
                  });
                  await loadChapterStatuses();
                })
              }
            >
              <Wand2 size={16} />
              真实API脚本
            </button>
            <button
              type="button"
              disabled={!selectedChapterId}
              onClick={() =>
                run("生成分析", async () => {
                  const report = await api<JsonArtifact>(
                    `/projects/${selectedProjectId}/chapters/${selectedChapterId}/analysis`,
                    { method: "POST" },
                  );
                  setAnalysisReport(report);
                  await loadChapterStatuses();
                })
              }
            >
              分析
            </button>
            <button
              type="button"
              disabled={!selectedChapterId}
              onClick={() =>
                run("生成策划", async () => {
                  const plan = await api<JsonArtifact>(
                    `/projects/${selectedProjectId}/chapters/${selectedChapterId}/plan`,
                    { method: "POST" },
                  );
                  setPodcastPlan(plan);
                  await loadChapterStatuses();
                })
              }
            >
              策划
            </button>
            <button
              type="button"
              disabled={!selectedChapterId}
              onClick={() =>
                run("生成脚本", async () => {
                  const data = await api<ScriptBlock[]>(
                    `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script`,
                    { method: "POST" },
                  );
                  setScriptBlocks(data);
                  await loadChapterStatuses();
                })
              }
            >
              脚本
            </button>
            <button
              type="button"
              disabled={!scriptBlocks.length}
              onClick={() =>
                run("审核脚本", async () => {
                  const report = await api<JsonArtifact>(
                    `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script-review`,
                    { method: "POST" },
                  );
                  setScriptReview(report);
                })
              }
            >
              <Check size={16} />
              审核脚本
            </button>
            <button
              type="button"
              disabled={!scriptBlocks.length}
              onClick={() =>
                run("确认脚本", async () => {
                  const data = await api<ScriptBlock[]>(
                    `/projects/${selectedProjectId}/chapters/${selectedChapterId}/script/confirm`,
                    { method: "POST" },
                  );
                  setScriptBlocks(data);
                  await loadChapterStatuses();
                })
              }
            >
              <Check size={16} />
              确认
            </button>
            <button
              type="button"
              disabled={!scriptBlocks.length}
              onClick={() =>
                run("生成 TTS", async () => {
                  const task = await api<TtsTask>(
                    `/projects/${selectedProjectId}/chapters/${selectedChapterId}/tts/generate`,
                    { method: "POST" },
                  );
                  setTtsTask(task);
                  await loadTtsTasks();
                  await loadChapterStatuses();
                })
              }
            >
              <FileAudio size={16} />
              TTS
            </button>
            </div>
          </details>

          {pipelineRun && (
            <div className={`pipelineStatus ${pipelineRun.status}`}>
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
                {pipelineRun.tts_status && <span>TTS {pipelineRun.tts_status}</span>}
                {pipelineRun.rounds && <span>{pipelineRun.rounds} rounds</span>}
                {pipelineRun.task_id && <code>{pipelineRun.task_id}</code>}
                {pipelineRun.message && <span>{pipelineRun.message}</span>}
              </div>
            </div>
          )}

          <div className="artifactGrid">
            <details className="artifact" open={Boolean(analysisReport)}>
              <summary>
                <span>章节分析</span>
                <small>{analysisReport ? analysisReport.status : "未生成"}</small>
              </summary>
              {analysisReport ? (
                <pre>{JSON.stringify(analysisReport.content_json, null, 2)}</pre>
              ) : (
                <p>暂无分析结果</p>
              )}
            </details>
            <details className="artifact" open={Boolean(podcastPlan)}>
              <summary>
                <span>播客策划</span>
                <small>{podcastPlan ? podcastPlan.status : "未生成"}</small>
              </summary>
              {podcastPlan ? (
                <pre>{JSON.stringify(podcastPlan.content_json, null, 2)}</pre>
              ) : (
                <p>暂无策划结果</p>
              )}
            </details>
          </div>

          <details className="artifact reviewArtifact" open={Boolean(scriptReview)}>
            <summary>
              <span>脚本审核</span>
              <small>{scriptReview ? scriptReview.status : "未生成"}</small>
            </summary>
            {scriptReview ? (
              <pre>{JSON.stringify(scriptReview.content_json, null, 2)}</pre>
            ) : (
              <p>暂无审核报告</p>
            )}
          </details>

          <div className="ttsStatus">
            <strong>TTS</strong>
            <span>{ttsTask ? `${ttsTask.status} · ${ttsTask.rounds_finished}/${ttsTask.rounds_total}` : "尚未生成"}</span>
            {ttsTask?.output_path && <code>{ttsTask.output_path}</code>}
            {ttsTask?.status === "success" && (
              <>
                <audio
                  controls
                  src={`${API_BASE}/projects/${selectedProjectId}/chapters/${selectedChapterId}/tts/tasks/${ttsTask.id}/audio`}
                />
                <a
                  className="downloadLink"
                  href={`${API_BASE}/projects/${selectedProjectId}/chapters/${selectedChapterId}/tts/tasks/${ttsTask.id}/audio`}
                  download
                >
                  下载 MP3
                </a>
              </>
            )}
            {ttsTask?.error_message && <small>{ttsTask.error_message}</small>}
          </div>

          <div className="ttsStatus">
            <strong>全集音频</strong>
            <span>
              {fullAudioTask
                ? `${fullAudioTask.status} · ${fullAudioTask.chapters_included}/${fullAudioTask.chapters_total} 章`
                : "尚未合成"}
            </span>
            {fullAudioTask?.output_path && <code>{fullAudioTask.output_path}</code>}
            {fullAudioTask?.status === "success" && (
              <>
                <audio
                  controls
                  src={`${API_BASE}/projects/${selectedProjectId}/audio/full/${fullAudioTask.id}/file`}
                />
                <a
                  className="downloadLink"
                  href={`${API_BASE}/projects/${selectedProjectId}/audio/full/${fullAudioTask.id}/file`}
                  download
                >
                  下载全集 MP3
                </a>
              </>
            )}
            {fullAudioTask?.error_message && <small>{fullAudioTask.error_message}</small>}
          </div>

          <section className="deliveryPanel" aria-label="产物管理">
            <div className="sectionHeader">
              <strong>产物管理</strong>
              <span>
                {missingAudioChapters.length
                  ? `还缺 ${missingAudioChapters.length} 章音频`
                  : "分章音频已齐备"}
              </span>
            </div>
            <div className="deliverySummary">
              <div>
                <span>分章 MP3</span>
                <strong>{chapterStatusSummary.audio}/{chapters.length || 0}</strong>
                <small>{formatBytes(chapterAudioBytes)}</small>
              </div>
              <div>
                <span>全集 MP3</span>
                <strong>{fullAudioTask?.status === "success" ? "已生成" : "未生成"}</strong>
                <small>
                  {fullAudioTask?.status === "success"
                    ? `${formatBytes(fullAudioTask.output_bytes)} · ${new Date(fullAudioTask.created_at).toLocaleString()}`
                    : "合成全集后可下载"}
                </small>
              </div>
              <div className={missingAudioChapters.length ? "deliveryWarn" : "deliveryReady"}>
                <span>交付检查</span>
                <strong>{missingAudioChapters.length ? "待补齐" : "可交付"}</strong>
                <small>{missingAudioChapters.length ? "先生成缺失章节音频" : "ZIP 和全集均可导出"}</small>
              </div>
            </div>
            <div className="deliveryActions">
              <a
                className={chapterStatusSummary.audio ? "primaryLinkButton" : "primaryLinkButton disabled"}
                href={`${API_BASE}/projects/${selectedProjectId}/audio/chapters/export`}
                download
                aria-disabled={!chapterStatusSummary.audio}
              >
                <Download size={16} />
                分章 MP3 ZIP
              </a>
              {fullAudioTask?.status === "success" ? (
                <a
                  className="primaryLinkButton"
                  href={`${API_BASE}/projects/${selectedProjectId}/audio/full/${fullAudioTask.id}/file`}
                  download
                >
                  <Download size={16} />
                  全集 MP3
                </a>
              ) : (
                <button
                  type="button"
                  disabled={!selectedProjectId || !chapterStatusSummary.audio}
                  onClick={() => run("合成全集", runBuildFullAudio)}
                >
                  <PackageCheck size={16} />
                  合成全集
                </button>
              )}
            </div>
            <div className="chapterAudioList" aria-label="分章音频列表">
              {chapterDeliverables.length ? (
                chapterDeliverables.map(({ chapter, status }) => {
                  const ready = status?.latest_tts_status === "success" && status.latest_tts_task_id;
                  return (
                    <article className={ready ? "chapterAudio ready" : "chapterAudio"} key={chapter.id}>
                      <div>
                        <strong>第 {chapter.chapter_number} 章 · {chapter.title}</strong>
                        <span>
                          {status?.latest_tts_status ?? "未生成"}
                          {status?.rounds_total ? ` · ${status.rounds_finished}/${status.rounds_total} rounds` : ""}
                          {status?.latest_tts_output_bytes ? ` · ${formatBytes(status.latest_tts_output_bytes)}` : ""}
                          {status?.latest_tts_created_at
                            ? ` · ${new Date(status.latest_tts_created_at).toLocaleString()}`
                            : ""}
                        </span>
                        {status?.latest_tts_error_message && <small>{status.latest_tts_error_message}</small>}
                      </div>
                      {ready ? (
                        <a
                          className="downloadLink"
                          href={`${API_BASE}/projects/${selectedProjectId}/chapters/${chapter.id}/tts/tasks/${status.latest_tts_task_id}/audio`}
                          download
                        >
                          下载
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="ghostButton"
                          onClick={() => setSelectedChapterId(chapter.id)}
                        >
                          查看
                        </button>
                      )}
                    </article>
                  );
                })
              ) : (
                <p className="emptyText">解析章节后会显示分章音频产物。</p>
              )}
            </div>
          </section>

          <div className="taskHistory">
            <div className="sectionHeader">
              <strong>TTS 历史</strong>
              <button
                type="button"
                className="ghostButton"
                disabled={!selectedChapterId}
                onClick={() => run("刷新 TTS 历史", () => loadTtsTasks())}
              >
                刷新
              </button>
            </div>
            {ttsTasks.length ? (
              ttsTasks.map((task) => (
                <article className="taskItem" key={task.id}>
                  <div>
                    <strong>{task.status}</strong>
                    <span>
                      {task.rounds_finished}/{task.rounds_total} · {new Date(task.created_at).toLocaleString()}
                    </span>
                  </div>
                  {task.status === "success" && (
                    <a
                      href={`${API_BASE}/projects/${selectedProjectId}/chapters/${selectedChapterId}/tts/tasks/${task.id}/audio`}
                      download
                    >
                      MP3
                    </a>
                  )}
                  {task.error_message && <small>{task.error_message}</small>}
                </article>
              ))
            ) : (
              <p className="emptyText">暂无 TTS 任务</p>
            )}
          </div>

          <div className="scriptBlocks">
            {scriptBlocks.map((block) => (
              <article className="scriptBlock" key={block.id}>
                <div className="blockHeader">
                  <span>{block.block_index}. {block.speaker}</span>
                  <span>{block.status}</span>
                  <button
                    type="button"
                    className="iconOnly"
                    aria-label={block.locked ? "解锁脚本块" : "锁定脚本块"}
                    onClick={() =>
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
                  >
                    {block.locked ? <Lock size={15} /> : <Unlock size={15} />}
                  </button>
                </div>
                <textarea
                  disabled={block.locked}
                  value={block.text}
                  onChange={(event) =>
                    setScriptBlocks((items) =>
                      items.map((item) => (item.id === block.id ? { ...item, text: event.target.value } : item)),
                    )
                  }
                  onBlur={() =>
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
                />
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

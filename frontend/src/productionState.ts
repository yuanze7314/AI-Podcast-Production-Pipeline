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
    exportReady: total > 0 && audio === total,
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

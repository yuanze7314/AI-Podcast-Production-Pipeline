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

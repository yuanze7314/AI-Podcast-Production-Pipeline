import { Check, FileAudio, Lock, RefreshCw, Unlock, X } from "lucide-react";

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
  busy: boolean;
  onClose: () => void;
  onConfirmScript: () => void;
  onGenerateAudio: () => void;
  onGenerateScript: () => void;
  onReviewScript: () => void;
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
  busy,
  onClose,
  onConfirmScript,
  onGenerateAudio,
  onGenerateScript,
  onReviewScript,
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
            <span>{chapter ? `第 ${chapter.chapter_number} 章 · ${chapter.start_page}-${chapter.end_page} 页` : "未选择章节"}</span>
            <strong>{chapter?.title || "脚本编辑"}</strong>
          </div>
          <button type="button" className="iconOnly" aria-label="关闭脚本编辑" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="drawerActions">
          <button type="button" disabled={busy || !chapter} onClick={onGenerateScript}>
            <RefreshCw size={16} />
            重新生成
          </button>
          <button type="button" disabled={busy || !scriptBlocks.length} onClick={onReviewScript}>
            <Check size={16} />
            审核脚本
          </button>
          <button type="button" disabled={busy || !scriptBlocks.length} onClick={onConfirmScript}>
            <Check size={16} />
            保存并确认
          </button>
          <button type="button" disabled={busy || !scriptBlocks.length} onClick={onGenerateAudio}>
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
                  <span>{block.status} · 约 {Math.round(block.estimated_seconds)} 秒</span>
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
                {!ttsTasks.length && <p className="emptyText">暂无 TTS 任务</p>}
              </div>
            </details>
          </section>
        </div>
      </aside>
    </div>
  );
}

import type { ChapterPrimaryAction, ChapterQueueItem } from "../productionState";

type ChapterQueueProps = {
  items: ChapterQueueItem[];
  busy: boolean;
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
  busy,
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
          <button type="button" disabled={busy} onClick={() => runAction(item.primaryAction, item.chapter.id)}>
            {actionLabels[item.primaryAction]}
          </button>
        </article>
      ))}
      {!items.length && <p className="emptyText">导入并解析 PDF 后显示章节队列。</p>}
    </section>
  );
}

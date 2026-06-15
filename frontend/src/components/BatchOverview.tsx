import type { ProductionSummary } from "../productionState";

type BatchOverviewProps = {
  summary: ProductionSummary;
  bookTitle: string;
  chapterAudioBytes: string;
};

export function BatchOverview({ summary, bookTitle, chapterAudioBytes }: BatchOverviewProps) {
  return (
    <section className="batchOverview" aria-label="整本书完成度">
      <div className="overviewTop">
        <div>
          <span>整本书完成度</span>
          <strong>{summary.completion}%</strong>
        </div>
        <small>{chapterAudioBytes}</small>
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

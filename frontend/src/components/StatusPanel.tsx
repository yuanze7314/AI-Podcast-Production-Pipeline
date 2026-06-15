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
          <div><span>音频错误</span><strong>{summary.failed}</strong></div>
        </div>
      </section>
      <section className="mutedPanel">
        <strong>状态</strong>
        <p>{notice}</p>
      </section>
    </aside>
  );
}

import { Download, FileAudio, GitMerge, PackageCheck, Play, RefreshCw } from "lucide-react";
import type { ProductionSummary } from "../productionState";

type BatchPipelineProps = {
  summary: ProductionSummary;
  busy: boolean;
  hasProject: boolean;
  hasChapters: boolean;
  audioExportHref: string;
  fullAudioHref: string | null;
  fullAudioReady: boolean;
  lastScriptFailed: number;
  lastTtsFailed: number;
  onParsePdf: () => void;
  onBatchScript: () => void;
  onRetryScript: () => void;
  onBatchTts: () => void;
  onRetryTts: () => void;
  onBuildFullAudio: () => void;
};

export function BatchPipeline({
  summary,
  busy,
  hasProject,
  hasChapters,
  audioExportHref,
  fullAudioHref,
  fullAudioReady,
  lastScriptFailed,
  lastTtsFailed,
  onParsePdf,
  onBatchScript,
  onRetryScript,
  onBatchTts,
  onRetryTts,
  onBuildFullAudio,
}: BatchPipelineProps) {
  const stages = [
    { label: "PDF", value: hasChapters ? "已解析" : hasProject ? "待解析" : "未选择" },
    { label: "脚本", value: `${summary.scripted} / ${summary.total}` },
    { label: "确认", value: `${summary.confirmed} / ${summary.total}` },
    { label: "TTS", value: `${summary.audio} / ${summary.total}` },
    { label: "导出", value: fullAudioReady ? "全集就绪" : summary.exportReady ? "可合成" : "待音频" },
  ];

  return (
    <section className="batchPipeline" aria-label="当前批处理">
      <div className="sectionHeader">
        <strong>当前批处理</strong>
        <span>{busy ? "运行中" : "待命"}</span>
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
        <button type="button" disabled={!hasProject || busy} onClick={onParsePdf}>
          <Play size={16} />
          解析 PDF
        </button>
        <button type="button" disabled={!hasProject || !hasChapters || busy} onClick={onBatchScript}>
          <GitMerge size={16} />
          批量 LangGraph 脚本
        </button>
        <button type="button" disabled={!hasProject || !hasChapters || busy} onClick={onBatchTts}>
          <FileAudio size={16} />
          批量音频
        </button>
        <button type="button" disabled={!hasProject || !summary.audio || busy} onClick={onBuildFullAudio}>
          <PackageCheck size={16} />
          合成全集
        </button>
        <a className={summary.audio ? "primaryLinkButton" : "primaryLinkButton disabled"} href={audioExportHref} download>
          <Download size={16} />
          分章 ZIP
        </a>
        {fullAudioHref && (
          <a className={fullAudioReady ? "primaryLinkButton" : "primaryLinkButton disabled"} href={fullAudioHref} download>
            <Download size={16} />
            全集 MP3
          </a>
        )}
      </div>
      <details className="advancedInline">
        <summary>
          <span>高级批处理</span>
          <small>失败重跑和低频维护操作</small>
        </summary>
        <div className="batchActions compactActions">
          <button type="button" disabled={!lastScriptFailed || busy} onClick={onRetryScript}>
            <RefreshCw size={16} />
            重跑失败脚本 {lastScriptFailed ? `(${lastScriptFailed})` : ""}
          </button>
          <button type="button" disabled={!lastTtsFailed || busy} onClick={onRetryTts}>
            <RefreshCw size={16} />
            重跑失败音频 {lastTtsFailed ? `(${lastTtsFailed})` : ""}
          </button>
        </div>
      </details>
    </section>
  );
}

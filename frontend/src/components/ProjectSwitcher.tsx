import { ChangeEvent, RefObject, useMemo, useState } from "react";
import { FileText, FolderOpen, Play, Plus, Upload, X } from "lucide-react";

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
  busy: boolean;
  onProjectTitleChange: (value: string) => void;
  onBookTitleChange: (value: string) => void;
  onLocalPdfPathChange: (value: string) => void;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onImportLocalPdf: () => void;
  onUploadPdf: () => void;
  onParsePdf: () => void;
};

export function ProjectSwitcher({
  projects,
  selectedProject,
  projectTitle,
  bookTitle,
  localPdfPath,
  uploadInputRef,
  busy,
  onProjectTitleChange,
  onBookTitleChange,
  onLocalPdfPathChange,
  onCreateProject,
  onSelectProject,
  onImportLocalPdf,
  onUploadPdf,
  onParsePdf,
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
              <button type="button" disabled={busy} onClick={onCreateProject}>
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
              <button type="button" disabled={busy || !selectedProject || !localPdfPath} onClick={onImportLocalPdf}>
                <Upload size={16} />
                导入 PDF
              </button>
              <label>
                上传 PDF
                <input ref={uploadInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
              </label>
              <button type="button" disabled={busy || !selectedProject} onClick={onUploadPdf}>
                <Upload size={16} />
                上传
              </button>
              <button type="button" disabled={busy || !selectedProject} onClick={onParsePdf}>
                <Play size={16} />
                解析 PDF
              </button>
            </div>

            <div className="drawerHint">
              <FileText size={15} />
              <span>项目列表默认收起，不占用批量生产主屏。</span>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

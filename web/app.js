const state = {
  projects: [],
  selectedId: null,
  chapters: [],
  selectedChapterId: null,
  selectedChapter: null,
  dirty: false
};

const el = {
  projectList: document.querySelector('#projectList'),
  projectForm: document.querySelector('#projectForm'),
  currentProject: document.querySelector('#currentProject'),
  jobState: document.querySelector('#jobState'),
  cancelJobBtn: document.querySelector('#cancelJobBtn'),
  artifactStatus: document.querySelector('#artifactStatus'),
  chapterList: document.querySelector('#chapterList'),
  selectedChapterTitle: document.querySelector('#selectedChapterTitle'),
  selectedChapterBadges: document.querySelector('#selectedChapterBadges'),
  chapterAudioPanel: document.querySelector('#chapterAudioPanel'),
  chapterText: document.querySelector('#chapterText'),
  progressLabel: document.querySelector('#progressLabel'),
  progressPercent: document.querySelector('#progressPercent'),
  progressWrap: document.querySelector('#progressWrap'),
  progressBar: document.querySelector('#progressBar'),
  reviewPath: document.querySelector('#reviewPath'),
  audioPath: document.querySelector('#audioPath'),
  finalAudioPath: document.querySelector('#finalAudioPath'),
  toast: document.querySelector('#toast')
};

const stageNames = {
  phase1: 'Phase 1 提取',
  phase2: 'Phase 2 编剧',
  review: '导出审阅',
  audio: '生成音频',
  chapter: '重跑单章',
  remix: '重合成完整音频',
  merge: '合成完整音频',
  all: '完整流水线'
};

const jobStatusNames = {
  running: '运行中',
  canceling: '正在终止',
  canceled: '已取消',
  completed: '已完成',
  failed: '失败'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  setTimeout(() => {
    el.toast.hidden = true;
  }, 3600);
}

function handleAction(action) {
  return async event => {
    try {
      await action(event);
    } catch (error) {
      toast(error.message);
    }
  };
}

async function api(apiPath, options = {}) {
  const response = await fetch(apiPath, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

function selectedProject() {
  return state.projects.find(project => project.id === state.selectedId) || null;
}

function currentJobRunning() {
  return ['running', 'canceling'].includes(selectedProject()?.job?.status);
}

function canCancelJob() {
  return selectedProject()?.job?.status === 'running';
}

function clampPercent(value) {
  const percent = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(percent) ? percent : 0)));
}

function fillForm(project) {
  const form = el.projectForm;
  form.name.value = project.name || '';
  form.bookPath.value = project.bookPath || '';
  form.reviewsPath.value = project.reviewsPath || '';
  form.tocPath.value = project.tocPath || '';
  form.voiceMapPath.value = project.voiceMapPath || './src/config/voice_map.json';
  form.openaiApiKey.value = project.openaiApiKey || '';
  form.openaiBaseUrl.value = project.openaiBaseUrl || '';
  form.openaiModel.value = project.openaiModel || '';
  form.volcengineAppId.value = project.volcengineAppId || '';
  form.volcengineAccessToken.value = project.volcengineAccessToken || '';
  form.volcengineTtsEndpoint.value = project.volcengineTtsEndpoint || '';
  form.volcengineResourceId.value = project.volcengineResourceId || '';
  form.volcengineAppKey.value = project.volcengineAppKey || '';
  form.audioRetryDelayMs.value = project.audioRetryDelayMs ?? 3000;
  form.skipExistingAudio.checked = project.skipExistingAudio !== false;
}

function formData() {
  const form = el.projectForm;
  return {
    name: form.name.value.trim(),
    bookPath: form.bookPath.value.trim(),
    reviewsPath: form.reviewsPath.value.trim(),
    tocPath: form.tocPath.value.trim(),
    voiceMapPath: form.voiceMapPath.value.trim(),
    openaiApiKey: form.openaiApiKey.value.trim(),
    openaiBaseUrl: form.openaiBaseUrl.value.trim(),
    openaiModel: form.openaiModel.value.trim(),
    volcengineAppId: form.volcengineAppId.value.trim(),
    volcengineAccessToken: form.volcengineAccessToken.value.trim(),
    volcengineTtsEndpoint: form.volcengineTtsEndpoint.value.trim(),
    volcengineResourceId: form.volcengineResourceId.value.trim(),
    volcengineAppKey: form.volcengineAppKey.value.trim(),
    audioRetryDelayMs: Number(form.audioRetryDelayMs.value || 3000),
    skipExistingAudio: form.skipExistingAudio.checked
  };
}

function maybeDiscardDirty() {
  if (!state.dirty) return true;
  return window.confirm('当前章节文本还没有保存，确定要切换吗？');
}

function badge(label, ok, extraClass = '') {
  return `<em class="${ok ? 'ok' : 'missing'} ${extraClass}">${escapeHtml(label)}</em>`;
}

function renderProjects() {
  el.projectList.innerHTML = '';

  if (state.projects.length === 0) {
    el.projectList.innerHTML = '<p class="label empty-state">还没有项目。先填写输入并保存。</p>';
    return;
  }

  for (const project of state.projects) {
    const button = document.createElement('button');
    button.className = `project-item ${project.id === state.selectedId ? 'active' : ''}`;
    button.setAttribute('aria-current', project.id === state.selectedId ? 'true' : 'false');
    button.innerHTML = `
      <strong>${escapeHtml(project.name)}</strong>
      <span>${escapeHtml(project.bookPath || '-')}</span>
    `;
    button.addEventListener('click', handleAction(async () => {
      if (project.id === state.selectedId) return;
      if (!maybeDiscardDirty()) return;

      state.selectedId = project.id;
      state.chapters = [];
      state.selectedChapterId = null;
      state.selectedChapter = null;
      state.dirty = false;
      fillForm(project);
      render();
      await loadChapters({ quiet: true });
    }));
    el.projectList.appendChild(button);
  }
}

function renderStatus() {
  const project = selectedProject();
  const job = project?.job;
  const progress = job?.progress || {
    percent: job?.status === 'completed' ? 100 : 0,
    message: job ? job.status : '等待任务'
  };

  const stageName = stageNames[job?.stage] || job?.stage;
  const jobStatus = jobStatusNames[job?.status] || job?.status;
  const progressPercent = clampPercent(progress.percent);
  el.currentProject.textContent = project?.name || '未选择';
  el.jobState.textContent = job
    ? `${stageName}${job.chapter ? ` 第 ${String(job.chapter).padStart(2, '0')} 章` : ''}: ${jobStatus}${job.error ? ` (${job.error})` : ''}`
    : '空闲';
  el.jobState.dataset.status = job?.status || 'idle';
  el.progressLabel.textContent = progress.message || '等待任务';
  el.progressPercent.textContent = `${progressPercent}%`;
  el.progressBar.style.width = `${progressPercent}%`;
  el.progressWrap.setAttribute('aria-valuenow', String(progressPercent));
  el.progressWrap.setAttribute('aria-valuetext', `${progress.message || '等待任务'}，${progressPercent}%`);

  const status = project?.status;
  const counts = status?.counts || {};
  const items = [
    ['元数据', status?.metadata, status?.metadata ? '已准备' : '待生成'],
    ['脚本', status?.finalScript, `${counts.minedChapters || 0} 章已提炼`],
    ['审阅文本', status?.reviewIndex, `${counts.reviewDialogues || 0} 章可编辑`],
    ['完整音频', status?.finalAudio, `${counts.chapterAudio || 0} 个分章音频`]
  ];

  el.artifactStatus.innerHTML = items.map(([label, ok, detail]) => `
    <div class="status-pill ${ok ? 'ok' : 'missing'}">
      <strong>${ok ? '已生成' : '待生成'}</strong>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(detail)}</small>
    </div>
  `).join('');

  el.reviewPath.textContent = status?.paths?.review || '-';
  el.audioPath.textContent = status?.paths?.chapterAudio || '-';
  el.finalAudioPath.textContent = status?.paths?.finalAudio || '-';

  document.querySelectorAll('[data-stage], #loadChaptersBtn, #refreshChapterBtn, #saveChapterBtn, #chapterAudioBtn, #chapterPipelineBtn, #chapterRemixBtn').forEach(button => {
    button.disabled = !project || currentJobRunning();
  });
  el.cancelJobBtn.disabled = !project || !canCancelJob();
}

function renderChapters() {
  if (state.chapters.length === 0) {
    el.chapterList.innerHTML = '<p class="label empty-state">保存项目后点击“读取目录”，这里会按目录列出每一章。</p>';
    return;
  }

  el.chapterList.innerHTML = state.chapters.map(chapter => {
    const active = chapter.id === state.selectedChapterId ? 'active' : '';
    const title = chapter.title || chapter.line || '未命名章节';
    const audioLabel = chapter.audioStale ? '音频需更新' : chapter.audio ? '有音频' : '待音频';
    const audioClass = chapter.audioStale ? 'warn' : '';
    const summary = [
      chapter.review ? '文本已生成' : '文本待生成',
      chapter.audioStale ? '音频需更新' : chapter.audio ? '音频已生成' : '音频待生成'
    ].join(' / ');

    return `
      <article class="chapter-row ${active}">
        <button class="chapter-summary" data-chapter-id="${escapeHtml(chapter.id)}" aria-expanded="${active ? 'true' : 'false'}">
          <strong class="chapter-seq">${escapeHtml(chapter.id)}</strong>
          <span class="chapter-title">${escapeHtml(title)}</span>
          <span class="chapter-arrow" aria-hidden="true"></span>
        </button>
        <div class="chapter-details">
          <div class="chapter-badges">
            ${badge(chapter.mined ? '已提炼' : '待提炼', chapter.mined)}
            ${badge(chapter.review ? '有文本' : '待文本', chapter.review)}
            ${badge(audioLabel, chapter.audio && !chapter.audioStale, audioClass)}
          </div>
          <p>${escapeHtml(summary)}</p>
        </div>
      </article>
    `;
  }).join('');

  el.chapterList.querySelectorAll('[data-chapter-id]').forEach(button => {
    button.addEventListener('click', handleAction(async () => {
      const chapterId = button.dataset.chapterId;
      if (chapterId === state.selectedChapterId) {
        collapseSelectedChapter();
        return;
      }
      await loadChapterDetail(chapterId);
    }));
  });
}

function collapseSelectedChapter() {
  if (!maybeDiscardDirty()) return;
  state.selectedChapterId = null;
  state.selectedChapter = null;
  state.dirty = false;
  el.chapterText.value = '';
  renderChapters();
  renderChapterDetail();
}

function renderChapterDetail() {
  const chapter = state.selectedChapter;
  const hasChapter = Boolean(chapter);

  if (!chapter) {
    el.selectedChapterTitle.textContent = '未选择章节';
    el.selectedChapterBadges.innerHTML = '';
    el.chapterAudioPanel.innerHTML = '<p class="label">选择章节后，会显示该章音频状态和播放器。</p>';
    el.chapterText.value = '读取目录并选择章节后，可以在这里查看和修改该章对话文本。';
  } else {
    const title = chapter.title || chapter.line || '未命名章节';
    el.selectedChapterTitle.textContent = `第 ${chapter.id} 章：${title}${state.dirty ? '（未保存）' : ''}`;
    el.selectedChapterBadges.innerHTML = [
      badge(chapter.review ? '文本已生成' : '文本待生成', chapter.review),
      badge(chapter.audio ? '音频已生成' : '音频待生成', chapter.audio),
      chapter.audioStale ? badge('音频落后于文本', false, 'warn') : ''
    ].join('');

    if (chapter.audioUrl) {
      el.chapterAudioPanel.innerHTML = `
        <div>
          <span class="label">分章音频</span>
          <strong>${chapter.audioStale ? '文本已修改，需要重新生成音频' : '当前音频可播放'}</strong>
        </div>
        <audio controls preload="metadata" src="${escapeHtml(chapter.audioUrl)}"></audio>
      `;
    } else {
      el.chapterAudioPanel.innerHTML = `
        <div>
          <span class="label">分章音频</span>
          <strong>还没有生成音频</strong>
        </div>
      `;
    }
  }

  document.querySelectorAll('#saveChapterBtn, #chapterAudioBtn, #chapterPipelineBtn, #chapterRemixBtn').forEach(button => {
    button.disabled = !hasChapter || currentJobRunning();
  });
}

function render() {
  renderProjects();
  renderStatus();
  renderChapters();
  renderChapterDetail();
}

async function loadProjects() {
  const previousJobStatus = selectedProject()?.job?.status;
  const data = await api('/api/projects');
  state.projects = data.projects;

  if (state.selectedId && !state.projects.some(project => project.id === state.selectedId)) {
    state.selectedId = null;
    state.chapters = [];
    state.selectedChapterId = null;
    state.selectedChapter = null;
    state.dirty = false;
  }

  if (!state.selectedId && state.projects.length > 0) {
    state.selectedId = state.projects[0].id;
    fillForm(state.projects[0]);
  }

  render();

  const nextJobStatus = selectedProject()?.job?.status;
  if (previousJobStatus === 'running' && nextJobStatus && nextJobStatus !== 'running' && state.chapters.length > 0) {
    if (state.dirty) {
      await loadChapters({ quiet: true, skipDirtyCheck: true });
      return;
    }
    await loadChapters({ loadSelected: Boolean(state.selectedChapterId), quiet: true, skipDirtyCheck: true });
  }
}

async function saveProject(event) {
  event.preventDefault();
  const project = selectedProject();
  const body = JSON.stringify(formData());
  const data = project
    ? await api(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PUT', body })
    : await api('/api/projects', { method: 'POST', body });

  state.selectedId = data.project.id;
  state.chapters = [];
  state.selectedChapterId = null;
  state.selectedChapter = null;
  state.dirty = false;
  toast('项目已保存');
  await loadProjects();
  await loadChapters({ quiet: true });
}

async function deleteProject() {
  const project = selectedProject();
  if (!project) return;
  const confirmed = window.confirm(`删除项目“${project.name}”及其本地生成产物？`);
  if (!confirmed) return;

  await api(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
  state.selectedId = null;
  state.chapters = [];
  state.selectedChapterId = null;
  state.selectedChapter = null;
  state.dirty = false;
  el.projectForm.reset();
  el.projectForm.voiceMapPath.value = './src/config/voice_map.json';
  el.projectForm.audioRetryDelayMs.value = 3000;
  el.projectForm.skipExistingAudio.checked = true;
  toast('项目已删除');
  await loadProjects();
}

async function runStage(stage, chapter = null) {
  const project = selectedProject();
  if (!project) return;

  await api(`/api/projects/${encodeURIComponent(project.id)}/run`, {
    method: 'POST',
    body: JSON.stringify({ stage, chapter })
  });
  toast(chapter ? `第 ${String(chapter).padStart(2, '0')} 章任务已开始` : `${stageNames[stage] || stage} 已开始`);
  await loadProjects();
}

async function cancelJob() {
  const project = selectedProject();
  if (!project || !canCancelJob()) return;
  const confirmed = window.confirm('确定要终止当前制作任务吗？正在请求中的 LLM / TTS 会被尽快中断。');
  if (!confirmed) return;

  await api(`/api/projects/${encodeURIComponent(project.id)}/cancel`, { method: 'POST' });
  toast('已请求终止当前任务');
  await loadProjects();
}

async function loadChapters(options = {}) {
  const {
    loadSelected = false,
    quiet = false,
    skipDirtyCheck = false
  } = options;
  const project = selectedProject();
  if (!project) return;
  if (!skipDirtyCheck && state.dirty && !maybeDiscardDirty()) return;

  const data = await api(`/api/projects/${encodeURIComponent(project.id)}/chapters`);
  state.chapters = data.chapters;
  if (!state.chapters.some(chapter => chapter.id === state.selectedChapterId)) {
    state.selectedChapterId = null;
    state.selectedChapter = null;
    state.dirty = false;
  }
  renderChapters();

  if (loadSelected && state.selectedChapterId) {
    await loadChapterDetail(state.selectedChapterId, { skipDirtyCheck: true });
  } else {
    renderChapterDetail();
  }

  if (!quiet) toast(`读取到 ${state.chapters.length} 个章节`);
}

async function loadChapterDetail(chapterId, options = {}) {
  const project = selectedProject();
  if (!project) return;
  if (!options.skipDirtyCheck && state.dirty && chapterId !== state.selectedChapterId && !maybeDiscardDirty()) return;

  const data = await api(`/api/projects/${encodeURIComponent(project.id)}/chapters/${encodeURIComponent(chapterId)}`);
  state.selectedChapterId = data.chapter.id;
  state.selectedChapter = data.chapter;
  state.dirty = false;
  el.chapterText.value = data.chapter.content || '';
  renderChapters();
  renderChapterDetail();
}

async function saveChapterReview(showToast = true) {
  const project = selectedProject();
  if (!project || !state.selectedChapterId) return;

  await api(`/api/projects/${encodeURIComponent(project.id)}/chapters/${encodeURIComponent(state.selectedChapterId)}/review`, {
    method: 'PUT',
    body: JSON.stringify({ content: el.chapterText.value })
  });

  state.dirty = false;
  if (showToast) toast('本章文本已保存，并已同步 TTS JSON');
  await loadChapters({ quiet: true, skipDirtyCheck: true });
  await loadChapterDetail(state.selectedChapterId, { skipDirtyCheck: true });
}

async function saveAndGenerateAudio() {
  await saveChapterReview(false);
  await runStage('audio', state.selectedChapterId);
}

async function saveAndRemix() {
  await saveChapterReview(false);
  await runStage('remix', state.selectedChapterId);
}

async function runChapterPipeline() {
  if (!state.selectedChapterId) return;
  const confirmed = window.confirm(
    state.dirty
      ? '重跑本章脚本会用 Agent 重新生成本章文本，未保存修改会被覆盖。继续吗？'
      : '重跑本章脚本会用 Agent 重新生成并覆盖当前章节文本。继续吗？'
  );
  if (!confirmed) return;
  state.dirty = false;
  await runStage('chapter', state.selectedChapterId);
}

el.projectForm.addEventListener('submit', handleAction(saveProject));
el.chapterText.addEventListener('input', () => {
  state.dirty = true;
  renderChapterDetail();
});
document.querySelector('#deleteProjectBtn').addEventListener('click', handleAction(deleteProject));
document.querySelector('#refreshBtn').addEventListener('click', handleAction(loadProjects));
el.cancelJobBtn.addEventListener('click', handleAction(cancelJob));
document.querySelector('#loadChaptersBtn').addEventListener('click', handleAction(() => loadChapters()));
document.querySelector('#refreshChapterBtn').addEventListener('click', handleAction(() => {
  if (state.selectedChapterId) return loadChapterDetail(state.selectedChapterId);
  return loadChapters();
}));
document.querySelector('#saveChapterBtn').addEventListener('click', handleAction(() => saveChapterReview(true)));
document.querySelector('#chapterAudioBtn').addEventListener('click', handleAction(saveAndGenerateAudio));
document.querySelector('#chapterRemixBtn').addEventListener('click', handleAction(saveAndRemix));
document.querySelector('#chapterPipelineBtn').addEventListener('click', handleAction(runChapterPipeline));
document.querySelectorAll('[data-stage]').forEach(button => {
  button.addEventListener('click', handleAction(() => runStage(button.dataset.stage)));
});

setInterval(() => loadProjects().catch(() => {}), 5000);
loadProjects()
  .then(() => loadChapters({ quiet: true }))
  .catch(error => toast(error.message));

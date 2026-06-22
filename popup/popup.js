// ── Prompt Vault — popup.js ──

let state = { folders: [], prompts: [] };
let activeFolder = 'all';
let editingPromptId = null;
let searchQuery = '';

// ── Helpers ──────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function $(sel) { return document.querySelector(sel); }

function showToast(msg, type = 'default') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { $(`#${id}`).classList.add('hidden'); }

// ── Storage ───────────────────────────────────────────────

async function loadData() {
  return new Promise((res) => {
    chrome.runtime.sendMessage({ type: 'GET_DATA' }, (r) => {
      state = r?.data || { folders: [], prompts: [] };
      res();
    });
  });
}

async function saveData() {
  return new Promise((res) => {
    chrome.runtime.sendMessage({ type: 'SAVE_DATA', data: state }, res);
  });
}

// ── Render ────────────────────────────────────────────────

function getFolderById(id) {
  return state.folders.find(f => f.id === id);
}

function renderFolderTabs() {
  const tabs = $('#folderTabs');
  tabs.innerHTML = `<button class="folder-tab ${activeFolder === 'all' ? 'active' : ''}" data-folder="all">All</button>`;
  state.folders.forEach(f => {
    const btn = document.createElement('button');
    btn.className = `folder-tab ${activeFolder === f.id ? 'active' : ''}`;
    btn.dataset.folder = f.id;
    btn.textContent = `${f.icon} ${f.name}`;
    tabs.appendChild(btn);
  });
  tabs.querySelectorAll('.folder-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFolder = btn.dataset.folder;
      renderFolderTabs();
      renderPrompts();
    });
  });
}

function renderPrompts() {
  const list = $('#promptList');
  const empty = $('#emptyState');

  let prompts = state.prompts.filter(p => {
    const inFolder = activeFolder === 'all' || p.folderId === activeFolder;
    const matchesSearch = !searchQuery ||
      p.title.toLowerCase().includes(searchQuery) ||
      p.body.toLowerCase().includes(searchQuery) ||
      (p.tags || []).some(t => t.toLowerCase().includes(searchQuery));
    return inFolder && matchesSearch;
  });

  // Sort: most recently created first
  prompts = prompts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Clear non-empty-state children
  [...list.children].forEach(c => { if (c !== empty) c.remove(); });

  if (prompts.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  prompts.forEach(p => {
    const folder = getFolderById(p.folderId);
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.innerHTML = `
      <div class="prompt-card-top">
        <span class="prompt-card-title">${esc(p.title)}</span>
        <div class="prompt-card-actions">
          <button class="card-action-btn copy" data-id="${p.id}" title="Copy">Copy</button>
          <button class="card-action-btn use" data-id="${p.id}" title="Use prompt">Use</button>
          <button class="card-action-btn edit" data-id="${p.id}" title="Edit">Edit</button>
        </div>
      </div>
      <div class="prompt-card-preview">${esc(p.body)}</div>
      <div class="prompt-card-meta">
        ${folder ? `<span class="folder-badge" style="background:${folder.color}">${folder.icon} ${esc(folder.name)}</span>` : ''}
        ${(p.tags || []).map(t => `<span class="tag-badge">#${esc(t)}</span>`).join('')}
        ${p.usageCount ? `<span class="usage-count">Used ${p.usageCount}×</span>` : ''}
      </div>
    `;

    card.querySelector('.copy').addEventListener('click', (e) => { e.stopPropagation(); copyPrompt(p.id); });
    card.querySelector('.use').addEventListener('click', (e) => { e.stopPropagation(); openUseModal(p.id); });
    card.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); openEditPrompt(p.id); });
    card.addEventListener('click', () => openUseModal(p.id));

    list.appendChild(card);
  });
}

function esc(str = '') {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Copy ──────────────────────────────────────────────────

async function copyPrompt(id, body) {
  const p = body !== undefined ? { body, id } : state.prompts.find(p => p.id === id);
  if (!p) return;
  try {
    await navigator.clipboard.writeText(p.body !== undefined ? p.body : body);
    incrementUsage(id);
    showToast('✓ Copied to clipboard', 'success');
  } catch {
    showToast('Copy failed — try again', 'error');
  }
}

// ── Insert ────────────────────────────────────────────────

async function insertPrompt(id, text) {
  const body = text !== undefined ? text : state.prompts.find(p => p.id === id)?.body;
  if (!body) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'INSERT_PROMPT', text: body }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        // Fallback: copy
        navigator.clipboard.writeText(body);
        showToast('Inserted (copied as fallback)', 'default');
      } else {
        showToast('✓ Inserted into page', 'success');
      }
    });
    incrementUsage(id);
    closeModal('useModal');
  } catch {
    showToast('Insert failed', 'error');
  }
}

async function incrementUsage(id) {
  const p = state.prompts.find(p => p.id === id);
  if (p) { p.usageCount = (p.usageCount || 0) + 1; await saveData(); renderPrompts(); }
}

// ── Use Modal ─────────────────────────────────────────────

function openUseModal(id) {
  const p = state.prompts.find(p => p.id === id);
  if (!p) return;
  $('#useModalTitle').textContent = p.title;
  $('#useModalBody').value = p.body;

  $('#useCopyBtn').onclick = () => {
    copyPrompt(id, $('#useModalBody').value);
    closeModal('useModal');
  };
  $('#useInsertBtn').onclick = () => insertPrompt(id, $('#useModalBody').value);
  $('#useEditBtn').onclick = () => { closeModal('useModal'); openEditPrompt(id); };

  openModal('useModal');
}

// ── Prompt Editor ─────────────────────────────────────────

function populateFolderSelect(selectEl, selectedId) {
  selectEl.innerHTML = '<option value="">— No folder —</option>';
  state.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.icon} ${f.name}`;
    if (f.id === selectedId) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function openAddPrompt() {
  editingPromptId = null;
  $('#modalTitle').textContent = 'New Prompt';
  $('#modalTitleInput').value = '';
  $('#modalBodyInput').value = '';
  $('#modalTagsInput').value = '';
  populateFolderSelect($('#modalFolderSelect'), activeFolder !== 'all' ? activeFolder : '');
  $('#deletePromptBtn').classList.add('hidden');
  openModal('promptModal');
  setTimeout(() => $('#modalTitleInput').focus(), 50);
}

function openEditPrompt(id) {
  const p = state.prompts.find(p => p.id === id);
  if (!p) return;
  editingPromptId = id;
  $('#modalTitle').textContent = 'Edit Prompt';
  $('#modalTitleInput').value = p.title;
  $('#modalBodyInput').value = p.body;
  $('#modalTagsInput').value = (p.tags || []).join(', ');
  populateFolderSelect($('#modalFolderSelect'), p.folderId);
  $('#deletePromptBtn').classList.remove('hidden');
  openModal('promptModal');
}

async function savePrompt() {
  const title = $('#modalTitleInput').value.trim();
  const body = $('#modalBodyInput').value.trim();
  if (!title) { showToast('Please add a title', 'error'); return; }
  if (!body) { showToast('Please add a prompt body', 'error'); return; }

  const tags = $('#modalTagsInput').value.split(',').map(t => t.trim()).filter(Boolean);
  const folderId = $('#modalFolderSelect').value || null;

  if (editingPromptId) {
    const p = state.prompts.find(p => p.id === editingPromptId);
    Object.assign(p, { title, body, tags, folderId });
  } else {
    state.prompts.unshift({ id: uid(), title, body, tags, folderId, createdAt: Date.now(), usageCount: 0 });
  }

  await saveData();
  closeModal('promptModal');
  renderPrompts();
  showToast(editingPromptId ? '✓ Prompt updated' : '✓ Prompt saved', 'success');
}

async function deletePrompt() {
  if (!editingPromptId) return;
  if (!confirm('Delete this prompt?')) return;
  state.prompts = state.prompts.filter(p => p.id !== editingPromptId);
  await saveData();
  closeModal('promptModal');
  renderPrompts();
  showToast('Prompt deleted');
}

// ── Folder Manager ────────────────────────────────────────

function renderFolderManager() {
  const list = $('#folderList');
  list.innerHTML = '';
  state.folders.forEach(f => {
    const count = state.prompts.filter(p => p.folderId === f.id).length;
    const item = document.createElement('div');
    item.className = 'folder-manager-item';
    item.innerHTML = `
      <span class="folder-dot" style="background:${f.color}"></span>
      <span style="font-size:15px">${f.icon}</span>
      <span class="folder-item-name">${esc(f.name)}</span>
      <span class="folder-item-count">${count} prompt${count !== 1 ? 's' : ''}</span>
      <button class="folder-delete-btn" data-id="${f.id}" title="Delete folder">✕</button>
    `;
    item.querySelector('.folder-delete-btn').addEventListener('click', () => deleteFolder(f.id));
    list.appendChild(item);
  });
  if (!state.folders.length) {
    list.innerHTML = '<p style="font-size:12px;color:var(--muted);padding:4px">No folders yet. Add one below.</p>';
  }
}

async function addFolder() {
  const name = $('#newFolderName').value.trim();
  if (!name) { showToast('Enter a folder name', 'error'); return; }
  const icon = $('#newFolderIcon').value.trim() || '🗂️';
  const color = $('#newFolderColor').value || '#6366f1';
  state.folders.push({ id: uid(), name, icon, color });
  await saveData();
  $('#newFolderName').value = '';
  $('#newFolderIcon').value = '';
  renderFolderManager();
  renderFolderTabs();
  showToast(`✓ "${name}" added`, 'success');
}

async function deleteFolder(id) {
  const f = getFolderById(id);
  if (!confirm(`Delete folder "${f?.name}"? Prompts inside will be unassigned.`)) return;
  state.folders = state.folders.filter(f => f.id !== id);
  state.prompts.forEach(p => { if (p.folderId === id) p.folderId = null; });
  if (activeFolder === id) activeFolder = 'all';
  await saveData();
  renderFolderManager();
  renderFolderTabs();
  renderPrompts();
  showToast('Folder deleted');
}

// ── Event Wiring ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderFolderTabs();
  renderPrompts();

  // Header buttons
  $('#addPromptBtn').addEventListener('click', openAddPrompt);
  $('#emptyAddBtn')?.addEventListener('click', openAddPrompt);

  $('#searchToggleBtn').addEventListener('click', () => {
    const bar = $('#searchBar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) {
      $('#searchInput').focus();
    } else {
      searchQuery = '';
      $('#searchInput').value = '';
      renderPrompts();
    }
  });

  $('#searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderPrompts();
  });

  $('#dashboardBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  $('#manageFoldersBtn').addEventListener('click', () => {
    renderFolderManager();
    openModal('folderModal');
  });

  // Prompt modal
  $('#savePromptBtn').addEventListener('click', savePrompt);
  $('#deletePromptBtn').addEventListener('click', deletePrompt);
  $('#cancelPromptBtn').addEventListener('click', () => closeModal('promptModal'));
  $('#closePromptModal').addEventListener('click', () => closeModal('promptModal'));

  // Use modal
  $('#closeUseModal').addEventListener('click', () => closeModal('useModal'));

  // Folder modal
  $('#addFolderBtn').addEventListener('click', addFolder);
  $('#newFolderName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFolder(); });
  $('#closeFolderModal').addEventListener('click', () => closeModal('folderModal'));
  $('#closeFolderModalBtn').addEventListener('click', () => {
    closeModal('folderModal');
    renderFolderTabs();
    renderPrompts();
  });

  // Close modals on backdrop click
  ['promptModal', 'folderModal', 'useModal'].forEach(id => {
    $(`#${id}`).addEventListener('click', (e) => {
      if (e.target === $(`#${id}`)) closeModal(id);
    });
  });
});

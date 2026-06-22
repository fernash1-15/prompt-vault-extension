// ── Prompt Vault Dashboard ──────────────────────────────

let state = { folders: [], prompts: [] };
let promptSortCol = 'usageCount';
let promptSortDir = 'desc';
let promptSearch = '';

// ── Data ──────────────────────────────────────────────────

function loadData() {
  return new Promise((res) => {
    chrome.storage.local.get(['promptVaultData'], (result) => {
      state = result?.promptVaultData || { folders: [], prompts: [] };
      res();
    });
  });
}

function getFolderById(id) {
  return state.folders.find(f => f.id === id);
}

function totalUses() {
  return state.prompts.reduce((sum, p) => sum + (p.usageCount || 0), 0);
}

function allTags() {
  const map = {};
  state.prompts.forEach(p => {
    (p.tags || []).forEach(t => {
      if (!t) return;
      map[t] = (map[t] || 0) + 1;
    });
  });
  return map;
}

// ── Render Overview ───────────────────────────────────────

function renderOverview() {
  // Stat cards
  document.getElementById('statTotal').textContent  = state.prompts.length;
  document.getElementById('statUses').textContent   = totalUses();
  document.getElementById('statFolders').textContent = state.folders.length;
  document.getElementById('statTags').textContent   = Object.keys(allTags()).length;
  document.getElementById('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();

  renderTopPromptsChart();
  renderDonut();
  renderLeaderboard();
}

function renderTopPromptsChart() {
  const container = document.getElementById('topPromptsChart');
  const empty = document.getElementById('topPromptsEmpty');
  const sorted = [...state.prompts]
    .filter(p => (p.usageCount || 0) > 0)
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    .slice(0, 8);

  if (!sorted.length) {
    container.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  container.classList.remove('hidden');

  const max = sorted[0].usageCount || 1;
  container.innerHTML = sorted.map(p => `
    <div class="bar-row">
      <span class="bar-label" title="${esc(p.title)}">${esc(p.title)}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.round((p.usageCount / max) * 100)}%"></div>
      </div>
      <span class="bar-count">${p.usageCount}</span>
    </div>
  `).join('');
}

function renderDonut() {
  const canvas = document.getElementById('donutCanvas');
  const ctx = canvas.getContext('2d');
  const legend = document.getElementById('donutLegend');

  // Count prompts per folder
  const unassigned = state.prompts.filter(p => !p.folderId).length;
  const segments = state.folders.map(f => ({
    label: `${f.icon} ${f.name}`,
    color: f.color,
    count: state.prompts.filter(p => p.folderId === f.id).length
  })).filter(s => s.count > 0);

  if (unassigned > 0) segments.push({ label: '📌 Unassigned', color: '#374151', count: unassigned });

  const total = segments.reduce((s, seg) => s + seg.count, 0);
  if (total === 0) {
    ctx.clearRect(0, 0, 180, 180);
    legend.innerHTML = '<span style="font-size:12px;color:var(--muted)">No prompts yet</span>';
    return;
  }

  const cx = 90, cy = 90, r = 70, inner = 46;
  ctx.clearRect(0, 0, 180, 180);

  let angle = -Math.PI / 2;
  segments.forEach(seg => {
    const sweep = (seg.count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    angle += sweep;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = '#151929';
  ctx.fill();

  // Center text
  ctx.fillStyle = '#e2e5f0';
  ctx.font = 'bold 22px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy - 8);
  ctx.fillStyle = '#6b7494';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillText('prompts', cx, cy + 10);

  // Legend
  legend.innerHTML = segments.map(s => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${s.color}"></span>
      <span class="legend-name">${esc(s.label)}</span>
      <span class="legend-count">${s.count}</span>
    </div>
  `).join('');
}

function renderLeaderboard() {
  const el = document.getElementById('leaderboard');
  const sorted = [...state.prompts]
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    .slice(0, 10);

  if (!sorted.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:12px 0">No prompts yet.</p>';
    return;
  }

  const rankClass = ['gold', 'silver', 'bronze'];
  el.innerHTML = sorted.map((p, i) => {
    const folder = getFolderById(p.folderId);
    return `
      <div class="lb-row">
        <span class="lb-rank ${rankClass[i] || ''}">${i + 1}</span>
        <span class="lb-title">${esc(p.title)}</span>
        ${folder ? `<span class="lb-folder" style="background:${folder.color}">${folder.icon} ${esc(folder.name)}</span>` : ''}
        <span class="lb-uses">${p.usageCount || 0} <span>uses</span></span>
      </div>
    `;
  }).join('');
}

// ── Render Prompts Table ──────────────────────────────────

function renderPromptsTable() {
  const tbody = document.getElementById('promptsTableBody');
  let prompts = [...state.prompts];

  if (promptSearch) {
    const q = promptSearch.toLowerCase();
    prompts = prompts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  prompts.sort((a, b) => {
    let av = a[promptSortCol] ?? '';
    let bv = b[promptSortCol] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return promptSortDir === 'asc' ? -1 : 1;
    if (av > bv) return promptSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (!prompts.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--muted)">No prompts found</td></tr>`;
    return;
  }

  tbody.innerHTML = prompts.map(p => {
    const folder = getFolderById(p.folderId);
    const tags = (p.tags || []).map(t => `<span style="font-size:11px;color:var(--muted);background:var(--card2);border:1px solid var(--border);padding:1px 6px;border-radius:8px;margin-right:4px">#${esc(t)}</span>`).join('');
    const uses = p.usageCount || 0;
    const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '–';
    return `
      <tr>
        <td><strong>${esc(p.title)}</strong></td>
        <td>${folder ? `<span style="background:${folder.color};color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600">${folder.icon} ${esc(folder.name)}</span>` : '<span style="color:var(--muted)">–</span>'}</td>
        <td>${tags || '<span style="color:var(--muted)">–</span>'}</td>
        <td><span class="uses-badge ${uses === 0 ? 'zero' : ''}">${uses}</span></td>
        <td style="color:var(--muted);font-size:12px">${date}</td>
      </tr>
    `;
  }).join('');

  // Update sort icons
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.col === promptSortCol) {
      icon.textContent = promptSortDir === 'asc' ? '↑' : '↓';
      icon.style.opacity = '1';
    } else {
      icon.textContent = '↕';
      icon.style.opacity = '.4';
    }
  });
}

// ── Render Folders ────────────────────────────────────────

function renderFolders() {
  const grid = document.getElementById('foldersGrid');
  if (!state.folders.length) {
    grid.innerHTML = '<p style="font-size:13px;color:var(--muted)">No folders yet. Create some in the extension!</p>';
    return;
  }

  const maxUses = Math.max(...state.folders.map(f =>
    state.prompts.filter(p => p.folderId === f.id).reduce((s, p) => s + (p.usageCount || 0), 0)
  ), 1);

  grid.innerHTML = state.folders.map(f => {
    const folderPrompts = state.prompts.filter(p => p.folderId === f.id);
    const uses = folderPrompts.reduce((s, p) => s + (p.usageCount || 0), 0);
    const topPrompt = [...folderPrompts].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))[0];
    const fillPct = Math.round((uses / maxUses) * 100);
    return `
      <div class="folder-stat-card">
        <div class="folder-stat-top">
          <div class="folder-icon-badge" style="background:${f.color}22">${f.icon}</div>
          <div>
            <div class="folder-stat-name">${esc(f.name)}</div>
            <div class="folder-stat-count">${folderPrompts.length} prompt${folderPrompts.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="folder-uses-bar">
          <div class="folder-uses-fill" style="width:${fillPct}%;background:${f.color}"></div>
        </div>
        <div class="folder-stat-meta">
          <div class="folder-meta-item">
            <strong>${uses}</strong>total uses
          </div>
          <div class="folder-meta-item" style="text-align:right">
            <strong style="font-size:12px;white-space:nowrap;overflow:hidden;max-width:90px;display:block;text-overflow:ellipsis">${topPrompt ? esc(topPrompt.title) : '–'}</strong>
            top prompt
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Render Tags ───────────────────────────────────────────

function renderTags() {
  const cloud = document.getElementById('tagsCloud');
  const tags = allTags();
  const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) {
    cloud.innerHTML = '<p style="font-size:13px;color:var(--muted)">No tags yet.</p>';
    return;
  }

  cloud.innerHTML = sorted.map(([tag, count]) => `
    <button class="tag-pill" data-tag="${esc(tag)}">
      <span class="tag-pill-name">#${esc(tag)}</span>
      <span class="tag-pill-count">${count}</span>
    </button>
  `).join('');

  cloud.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => showTagDetail(pill.dataset.tag));
  });
}

function showTagDetail(tag) {
  const detail = document.getElementById('tagDetail');
  const prompts = state.prompts.filter(p => (p.tags || []).includes(tag));
  document.getElementById('tagDetailName').textContent = `#${tag}`;
  document.getElementById('tagDetailList').innerHTML = prompts.map(p => {
    const folder = getFolderById(p.folderId);
    return `
      <div class="tag-detail-item">
        <span>${esc(p.title)}</span>
        <div style="display:flex;gap:8px;align-items:center">
          ${folder ? `<span style="background:${folder.color};color:#fff;font-size:10px;padding:1px 7px;border-radius:8px">${folder.icon} ${esc(folder.name)}</span>` : ''}
          <span style="font-size:12px;color:var(--accent2);font-weight:700">${p.usageCount || 0} uses</span>
        </div>
      </div>
    `;
  }).join('') || '<p style="font-size:13px;color:var(--muted)">No prompts with this tag.</p>';
  detail.classList.remove('hidden');
}

// ── Navigation ────────────────────────────────────────────

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');
  document.querySelector(`[data-view="${viewId}"]`).classList.add('active');

  if (viewId === 'overview') renderOverview();
  if (viewId === 'prompts') renderPromptsTable();
  if (viewId === 'folders') renderFolders();
  if (viewId === 'tags') renderTags();
}

// ── Helpers ───────────────────────────────────────────────

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderOverview();

  // Nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await loadData();
    switchView(document.querySelector('.nav-item.active').dataset.view);
  });

  // Table sort
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      if (promptSortCol === th.dataset.col) {
        promptSortDir = promptSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        promptSortCol = th.dataset.col;
        promptSortDir = th.dataset.col === 'usageCount' ? 'desc' : 'asc';
      }
      renderPromptsTable();
    });
  });

  // Table search
  document.getElementById('promptSearch').addEventListener('input', (e) => {
    promptSearch = e.target.value.trim();
    renderPromptsTable();
  });

  // Tag detail close
  document.getElementById('closeTagDetail').addEventListener('click', () => {
    document.getElementById('tagDetail').classList.add('hidden');
  });
});

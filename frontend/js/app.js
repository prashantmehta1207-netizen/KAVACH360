/* KAVACH360 AI — HTML/CSS/Vanilla JavaScript frontend */
const API = {
  async request(url, options = {}) {
    const response = await fetch(url, options);
    const type = response.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(body?.detail || body?.message || `Request failed (${response.status})`);
    return body;
  },
  get(url) { return this.request(url); },
  post(url, data) { return this.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  patch(url, data) { return this.request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
  upload(url, formData) { return this.request(url, { method: 'POST', body: formData }); }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const view = $('#appView');
let dashboardData = null;
let sites = [];
let inspections = [];
let observations = [];
let sops = [];
let actions = [];
let reports = [];
let health = { api: 'unknown', ollama: 'disconnected' };
let analysisTimer = null;
let selectedMapSite = null;
let selectedObservation = null;

const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const fmtDate = value => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtTime = value => value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}s`;
const shortId = value => String(value || '').slice(-6).toUpperCase();
const statusClass = status => ({ needs_review:'status-review', confirmed:'status-confirmed', dismissed:'status-neutral', resolved:'status-resolved', Pending:'status-review', 'In Progress':'status-progress', completed:'status-resolved', analyzing:'status-progress', queued:'status-progress', failed:'status-confirmed', uploaded:'status-progress', created:'status-neutral' }[status] || 'status-neutral');
const statusLabel = status => String(status || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const statusBadge = status => `<span class="status ${statusClass(status)}">${esc(statusLabel(status))}</span>`;
const iconFor = category => ({ PPE:'⛑', Electrical:'⚡', 'Fire Safety':'♨', Housekeeping:'▤', 'Fall Protection':'⌁', 'Access/Egress':'↗' }[category] || '⚠');
const emptyState = (title, copy) => `<div class="empty-state"><div style="font-size:24px">◇</div><strong>${esc(title)}</strong>${esc(copy)}</div>`;
const pageHeading = (eyebrow, title, subtitle, actions = '') => `<div class="page-heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="heading-actions">${actions}</div></div>`;
const demoBanner = `<div class="demo-banner"><strong>DEMO DATA</strong><span>Seeded sample records are shown for interface preview. New inspections use real backend and model results only.</span><span class="banner-spacer"></span><span>● Sample workspace</span></div>`;

async function refreshCore() {
  const results = await Promise.allSettled([
    API.get('/api/dashboard'), API.get('/api/sites'), API.get('/api/inspections'),
    API.get('/api/observations'), API.get('/api/sops'), API.get('/api/actions'),
    API.get('/api/reports'), API.get('/api/health')
  ]);
  const targets = [dashboardData, sites, inspections, observations, sops, actions, reports, health];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      switch (index) {
        case 0: dashboardData = result.value; break;
        case 1: sites = result.value; break;
        case 2: inspections = result.value; break;
        case 3: observations = result.value; break;
        case 4: sops = result.value; break;
        case 5: actions = result.value; break;
        case 6: reports = result.value; break;
        case 7: health = result.value; break;
      }
    }
  });
  updateConnection();
}

function updateConnection() {
  const label = $('#connectionLabel');
  if (!label) return;
  if (health.ollama === 'connected' && health.model_available) {
    label.className = 'connection-label online';
    label.innerHTML = '<i></i> Gemma model connected';
  } else if (health.ollama === 'connected') {
    label.className = 'connection-label';
    label.innerHTML = '<i></i> Ollama connected · model missing';
  } else {
    label.className = 'connection-label';
    label.innerHTML = '<i></i> Backend online · AI not connected';
  }
}

function toast(message, kind = 'normal') {
  const region = $('#toastRegion');
  const item = document.createElement('div');
  item.className = `toast ${kind === 'error' ? 'error' : kind === 'success' ? 'success' : ''}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 4200);
}

function showModal(content) {
  $('#modalContent').innerHTML = content;
  $('#modalBackdrop').hidden = false;
}
function closeModal() { $('#modalBackdrop').hidden = true; $('#modalContent').innerHTML = ''; }

function chartSvg() {
  const valuesA = [8, 12, 15, 20, 18, 24, 26, 31, 29, 34, 38, 41];
  const valuesB = [3, 5, 8, 7, 9, 11, 10, 13, 12, 15, 16, 20];
  const valuesC = [1, 2, 3, 4, 3, 5, 7, 6, 8, 10, 11, 14];
  const points = values => values.map((v, i) => `${34 + i * 48},${143 - v * 2.65}`).join(' ');
  const grids = [30, 65, 100, 135].map(y => `<line x1="34" y1="${y}" x2="566" y2="${y}" stroke="#edf1f5" stroke-width="1"/>`).join('');
  const xLabels = ['Sep 6','Sep 10','Sep 14','Sep 18','Sep 22','Sep 26','Sep 30','Oct 4','Oct 8','Oct 12','Oct 16','Oct 20'].map((x, i) => `<text x="${34 + i * 48}" y="166" text-anchor="middle" fill="#92a0af" font-size="8">${x}</text>`).join('');
  return `<svg class="line-chart" viewBox="0 0 590 178" role="img" aria-label="Sample safety trends chart">${grids}<polyline points="${points(valuesA)}" fill="none" stroke="#1769e8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points(valuesB)}" fill="none" stroke="#ef5c48" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points(valuesC)}" fill="none" stroke="#17a36a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${valuesA.map((v,i)=>`<circle cx="${34+i*48}" cy="${143-v*2.65}" r="2.7" fill="#1769e8"/>`).join('')}${xLabels}</svg>`;
}

function miniBlueprint() {
  return `<div class="dashboard-dual-map">
    <div class="map-preview-pane aerial-preview">
      <div class="map-pane-title"><span>◉ Aerial site view</span><small>Illustrative</small></div>
      <div class="aerial-preview-canvas">
        <img src="/assets/construction-aerial.webp" alt="Illustrative aerial construction site view">
        <span class="aerial-map-shade"></span>
        <span class="aerial-pin pin-blue" style="left:30%;top:36%">CAM 01</span>
        <span class="aerial-pin pin-red" style="left:24%;top:66%">!</span>
        <span class="aerial-pin pin-green" style="left:72%;top:57%">✓</span>
        <span class="aerial-pin pin-orange" style="left:78%;top:78%">!</span>
        <span class="map-image-caption">Green Valley Tower · site imagery</span>
      </div>
    </div>
    <div class="map-preview-pane blueprint-preview">
      <div class="map-pane-title"><span>▦ Site blueprint</span><small>Configured zones</small></div>
      <div class="blueprint-preview-canvas">
        <svg viewBox="0 0 420 250" role="img" aria-label="Illustrative construction site blueprint">
          <defs><pattern id="miniBlueprintGrid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#254767" stroke-width=".8"/></pattern></defs>
          <rect width="420" height="250" fill="#0a2038"/><rect width="420" height="250" fill="url(#miniBlueprintGrid)"/>
          <path d="M18 18H402V232H18Z" fill="none" stroke="#6588aa" stroke-width="2" stroke-dasharray="7 5"/>
          <path d="M18 122H402M210 18V232" stroke="#355879" stroke-width="12"/><path d="M18 122H402M210 18V232" stroke="#8da8c4" stroke-width="1.4" stroke-dasharray="7 7"/>
          <rect x="30" y="30" width="148" height="75" rx="8" fill="#a96d1c" fill-opacity=".88" stroke="#ffd08a"/><text x="104" y="62" fill="#fff" text-anchor="middle" font-size="12" font-weight="700">STORAGE ZONE</text><text x="104" y="80" fill="#ffe8c5" text-anchor="middle" font-size="9">3 observations</text>
          <rect x="242" y="30" width="148" height="75" rx="8" fill="#a6323d" fill-opacity=".88" stroke="#ffabb0"/><text x="316" y="62" fill="#fff" text-anchor="middle" font-size="12" font-weight="700">ELECTRICAL</text><text x="316" y="80" fill="#ffd8dc" text-anchor="middle" font-size="9">2 observations</text>
          <rect x="30" y="145" width="148" height="70" rx="8" fill="#145aa9" fill-opacity=".9" stroke="#81bcff"/><text x="104" y="177" fill="#fff" text-anchor="middle" font-size="12" font-weight="700">WORK AREA A</text>
          <rect x="242" y="145" width="148" height="70" rx="8" fill="#087b5b" fill-opacity=".9" stroke="#7ce8c1"/><text x="316" y="177" fill="#fff" text-anchor="middle" font-size="12" font-weight="700">WORK AREA B</text>
          <circle cx="72" cy="105" r="8" fill="#ff4c53" stroke="#fff" stroke-width="2"/><circle cx="348" cy="106" r="8" fill="#ff4c53" stroke="#fff" stroke-width="2"/><circle cx="104" cy="146" r="8" fill="#ffb544" stroke="#fff" stroke-width="2"/><circle cx="316" cy="215" r="8" fill="#16c98b" stroke="#fff" stroke-width="2"/>
          <text x="210" y="243" fill="#9ab7d3" font-size="8" text-anchor="middle">ILLUSTRATIVE BLUEPRINT · NOT TO SCALE</text>
        </svg>
      </div>
    </div>
  </div>`;
}

function renderDashboard() {
  const d = dashboardData || { stats: {}, recent_inspections: [], recent_alerts: [], categories: [] };
  const s = d.stats || {};
  const cards = [
    ['Total Inspections', s.total_inspections ?? '—', '▤', 'tone-blue', 'Recorded site inspections', 'blue'],
    ['Potential Hazards', s.potential_hazards ?? '—', '⚠', 'tone-orange', 'Observations needing attention', 'orange'],
    ['Pending Reviews', s.pending_reviews ?? '—', '◷', 'tone-purple', 'Awaiting supervisor review', 'purple'],
    ['Resolved Actions', s.resolved_actions ?? '—', '✓', 'tone-green', 'Safety actions closed', 'green']
  ];
  const stats = cards.map(c => `<article class="stat-card stat-${c[5]}"><div class="stat-top"><span>${c[0]}</span><span class="stat-icon ${c[3]}">${c[2]}</span></div><div class="stat-value">${c[1]}</div><div class="stat-foot">${c[4]}</div></article>`).join('');
  const inspectionRows = (d.recent_inspections || []).slice(0,4).map(i => `<tr data-searchable="${esc(`${i.name} ${i.site_name} ${i.video_filename}`.toLowerCase())}"><td class="table-name">${esc(shortId(i.id))}</td><td>${esc(i.site_name)}</td><td>${esc(fmtDate(i.created_at))}</td><td>${Number(i.observation_count || 0)}</td><td>${statusBadge(i.status)}</td><td><button class="btn btn-secondary btn-small" data-open-inspection="${esc(i.id)}">View</button></td></tr>`).join('');
  const alertRows = (d.recent_alerts || []).slice(0,4).map(o => `<div class="observation-feed-row"><div class="observation-icon">${iconFor(o.category)}</div><div class="feed-copy"><strong>${esc(o.observation)}</strong><small>${esc(o.zone_name || o.site_name || 'Site')} · ${fmtTime(o.timestamp)}</small></div><div class="feed-action">${statusBadge(o.review_status)}<button class="btn btn-soft btn-small" data-open-observation="${esc(o.id)}">Evidence</button></div></div>`).join('');
  const activity = [
    ...(d.recent_inspections || []).slice(0,2).map(i => ({icon:'✓', tone:'green', title:`${i.name} recorded`, meta:i.site_name, time:fmtDate(i.created_at)})),
    ...(d.recent_alerts || []).slice(0,3).map(o => ({icon:'!', tone:'orange', title:'Observation requires attention', meta:`${o.zone_name || o.site_name || 'Site'} · ${o.category}`, time:fmtTime(o.timestamp)}))
  ].slice(0,5).map(a => `<div class="activity-row"><span class="activity-icon activity-${a.tone}">${a.icon}</span><div><strong>${esc(a.title)}</strong><small>${esc(a.meta || '')}</small></div><time>${esc(a.time)}</time></div>`).join('');
  return `${pageHeading('Workspace overview','KAVACH360 Dashboard','Real-time construction site safety overview.', `<a class="btn btn-primary" href="#inspections">＋ New Video Inspection</a><a class="btn btn-secondary" href="#map">⌖ Open Site Map</a>`)}
    ${demoBanner}
    <section class="stats-grid dashboard-kpis">${stats}</section>
    <section class="command-grid">
      <article class="panel inspections-panel"><div class="panel-header"><div><h3>▣ &nbsp;Recent Inspections</h3><div class="panel-subtitle">Latest activity across your construction sites</div></div><a href="#inspections" class="small">View all →</a></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Site</th><th>Date &amp; time</th><th>Issues</th><th>Status</th><th></th></tr></thead><tbody>${inspectionRows || `<tr><td colspan="6">${emptyState('No inspections yet','Create an inspection to begin.')}</td></tr>`}</tbody></table></div></article>
      <article class="panel map-panel"><div class="panel-header"><div><h3>⌖ &nbsp;Smart Site Map</h3><div class="panel-subtitle">Aerial view + configured site blueprint</div></div><a href="#map" class="small">View full map →</a></div>${miniBlueprint()}<div class="map-caption map-caption-dark"><span><i class="legend-dot" style="background:#28a4ff"></i> Cameras &nbsp; <i class="legend-dot" style="background:#ff5158"></i> Hazards &nbsp; <i class="legend-dot" style="background:#16d69a"></i> Safe zones</span><a href="#map">Open interactive map</a></div></article>
    </section>
    <section class="dashboard-bottom-grid">
      <article class="panel observations-panel"><div class="panel-header"><div><h3>⚠ &nbsp;Recent Safety Observations</h3><div class="panel-subtitle">Visual cues that may need attention</div></div><a href="#hazards" class="small">View all →</a></div><div class="observation-feed">${alertRows || emptyState('No observations yet','Analyze a video to populate this list.')}</div></article>
      <article class="panel quick-panel"><div class="panel-header"><div><h3>ϟ &nbsp;Quick Actions</h3><div class="panel-subtitle">Common safety workflows</div></div></div><div class="quick-action-grid"><a href="#inspections" class="quick-action quick-blue"><span>▣</span><strong>New<br>Inspection</strong></a><a href="#map" class="quick-action quick-green"><span>⌖</span><strong>View<br>Site Map</strong></a><a href="#sops" class="quick-action quick-purple"><span>▤</span><strong>Upload<br>SOP Manual</strong></a><a href="#actions" class="quick-action quick-orange"><span>☑</span><strong>Review<br>Actions</strong></a></div></article>
      <article class="panel activity-panel"><div class="panel-header"><div><h3>⌁ &nbsp;Activity Feed</h3><div class="panel-subtitle">Recent saved records</div></div><span class="live-pill"><i></i> Backend status</span></div><div class="activity-feed">${activity || emptyState('No recent activity','Saved inspections and observations will appear here.')}</div></article>
    </section>`;
}

function renderInspections() {
  const siteOptions = sites.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  const rowsHtml = inspections.map(i => `<tr><td class="table-name">${esc(shortId(i.id))}</td><td>${esc(i.name)}</td><td>${esc(i.site_name)}</td><td>${esc(i.video_filename || 'Not uploaded')}</td><td>${esc(fmtDate(i.created_at))}</td><td>${statusBadge(i.status)}</td><td><button class="btn btn-secondary btn-small" data-open-inspection="${esc(i.id)}">Open</button></td></tr>`).join('');
  return `${pageHeading('Inspection workspace','Video Inspections','Upload a site walkthrough video and run a human-reviewed visual safety analysis.')}
    <div class="content-card"><div class="flex-between mb-12"><div><h3 class="card-title">Create New Inspection</h3><p class="card-description">Select a site, add a video, and send extracted frames to your configured Gemma model.</p></div><span class="status status-neutral">Max ${health.max_video_mb || 100} MB</span></div>
      <form id="inspectionForm" class="form-grid">
        <div class="field"><label for="inspectionName">Inspection name *</label><input id="inspectionName" name="name" required maxlength="150" placeholder="e.g. Tower Block A – Daily Check"></div>
        <div class="field"><label for="inspectionSite">Construction site *</label><select id="inspectionSite" name="site_id" required><option value="">Select a site</option>${siteOptions}</select></div>
        <div class="field"><label for="inspectionDescription">Description</label><input id="inspectionDescription" name="description" placeholder="Optional inspection notes"></div>
        <div class="field"><label for="cameraZone">Camera / zone (optional)</label><select id="cameraZone" name="camera_id"><option value="">Use site default zone</option></select></div>
        <div class="field full"><label>Construction video *</label><label for="videoFile" class="file-drop" id="videoDrop"><div class="upload-icon">⇧</div><strong>Drag and drop your video here</strong><small>or click to browse · MP4, MOV, M4V, AVI, MKV, WebM</small><small id="videoFileName">Maximum ${health.max_video_mb || 100} MB</small><input type="file" id="videoFile" name="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,.mkv,.m4v" required></label><video id="videoPreview" class="video-preview hidden" controls></video></div>
        <div class="field full"><div class="callout">AI output is preliminary. Every observation will be marked for human review; a single frame cannot establish a confirmed safety violation.</div></div>
        <div class="field full"><div class="flex-between"><span class="small muted" id="uploadStatus">Ready to create an inspection.</span><button class="btn btn-primary" type="submit" id="startInspectionBtn">Start Inspection →</button></div></div>
      </form>
    </div>
    <article class="panel"><div class="panel-header"><div><h3>Inspection History</h3><div class="panel-subtitle">All recorded inspections and their current status</div></div><span class="count-pill"><strong>${inspections.length}</strong> records</span></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Inspection</th><th>Site</th><th>Video</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7">${emptyState('No inspections yet','Your uploaded inspections will appear here.')}</td></tr>`}</tbody></table></div></article>`;
}

function renderAnalysis(id) {
  const ins = inspections.find(x => x.id === id);
  if (!ins) return `${pageHeading('Inspection','Inspection not found','The requested inspection could not be found.')}<div class="content-card">${emptyState('Inspection unavailable','Return to Video Inspections and select a record.')}</div>`;
  return `${pageHeading('Inspection workflow','Inspection Analysis',esc(ins.name), `<a href="#hazards" class="btn btn-secondary">All Observations</a>`)}
    <div class="content-card"><div class="flex-between"><div><h3 class="card-title">Analysis progress</h3><p class="card-description">Video frames are analyzed individually; the app does not claim continuous real-time CCTV monitoring.</p></div>${statusBadge(ins.status)}</div>
      <div class="step-list"><div class="step done"><b>1</b> Video uploaded</div><div class="step ${['queued','analyzing','completed'].includes(ins.status)?'done':''}"><b>2</b> Extract frames</div><div class="step ${ins.status==='analyzing'?'current':ins.status==='completed'?'done':''}"><b>3</b> Gemma analysis</div><div class="step ${ins.status==='completed'?'done':''}"><b>4</b> Review results</div></div>
      <div class="progress-row"><span id="analysisStatusText">${esc(ins.status === 'completed' ? 'Analysis completed' : ins.status === 'failed' ? 'Analysis failed' : 'Waiting for analysis status…')}</span><strong id="analysisPercent">${ins.status === 'completed' ? '100%' : ins.status === 'failed' ? 'Error' : '—'}</strong></div><div class="progress-track"><div class="progress-fill" id="analysisProgress" style="width:${ins.status==='completed'?100:ins.status==='failed'?0:20}%"></div></div>
      ${ins.error_message && ins.status==='failed' ? `<div class="callout danger-callout mt-12">${esc(ins.error_message)}</div>` : ''}
      <div class="flex-between mt-16"><span class="small muted">${esc(ins.video_filename || 'No video filename')}</span><div class="heading-actions"><button class="btn btn-secondary" data-refresh-analysis="${esc(id)}">↻ Refresh</button>${ins.status==='uploaded'||ins.status==='created'||ins.status==='failed'?`<button class="btn btn-primary" data-start-analysis="${esc(id)}">Run Gemma 4 Analysis</button>`:''}</div></div>
    </div>
    <div class="content-card"><div class="panel-header"><div><h3 class="card-title">Inspection observations</h3><p class="card-description">Only actual backend model responses appear here; seeded dashboard examples are separate demo records.</p></div></div><div id="analysisObservations">Loading observations…</div></div>`;
}

function renderHazards() {
  const cards = observations.map(o => `<article class="observation-card"><div class="observation-icon">${iconFor(o.category)}</div><div><h4>${esc(o.category)} · ${esc(o.observation)}</h4><p>${esc(o.evidence_description || 'Evidence description not available.')}</p><div class="observation-meta"><span>${esc(o.site_name || 'Site')}</span><span>${esc(o.zone_name || 'Unmapped zone')}</span><span>${fmtTime(o.timestamp)}</span><span>${esc(o.source === 'demo' ? 'Demo sample' : 'Model output')}</span></div></div><div>${statusBadge(o.review_status)}<div class="mt-12"><button class="btn btn-secondary btn-small" data-open-observation="${esc(o.id)}">Review</button></div></div></article>`).join('');
  return `${pageHeading('Visual review','Detected Safety Observations','Review evidence and decide whether each AI observation should be confirmed, dismissed, or investigated further.')}
    <div class="demo-banner"><strong>HUMAN REVIEW REQUIRED</strong><span>AI findings are visual cues, not final determinations. Verify the original scene and site context.</span></div>
    <div class="panel"><div class="panel-header"><div><h3>All observations</h3><div class="panel-subtitle">${observations.length} records across all sites</div></div><div class="filters"><select id="hazardStatusFilter"><option value="">All statuses</option><option value="needs_review">Needs review</option><option value="confirmed">Confirmed</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select><select id="hazardCategoryFilter"><option value="">All categories</option>${[...new Set(observations.map(o=>o.category))].map(c=>`<option>${esc(c)}</option>`).join('')}</select></div></div><div class="observation-list" id="observationList">${cards || emptyState('No observations yet','Upload a construction video and run Gemma 4 analysis to populate this page.')}</div></div>`;
}

function renderMapSvg(data) {
  const zones = data.zones || [];
  const obs = data.observations || [];
  const cameras = data.cameras || [];
  const fills = { storage:'#bd7d23', electrical:'#b83c43', work:'#176bc2', exit:'#0c8a65', gate:'#7654b9', fire:'#c65b32' };
  const zoneRects = zones.map(z => {
    const x = Number(z.x) * 10, y = Number(z.y) * 6, w = Number(z.width) * 10, h = Number(z.height) * 6;
    const count = obs.filter(o => o.zone_id === z.id && o.review_status !== 'dismissed').length;
    const label = esc(z.name).replace(/&amp;/g, '&');
    return `<g class="blueprint-zone" data-zone="${esc(z.id)}" tabindex="0" role="button" aria-label="${esc(z.name)}"><rect class="zone-rect" x="${x}" y="${y}" width="${w}" height="${h}" rx="13" fill="${fills[z.zone_type] || '#315b7e'}" fill-opacity=".86"/><text class="zone-label" x="${x+w/2}" y="${y+h/2-3}" text-anchor="middle">${label}</text><text class="zone-count" x="${x+w/2}" y="${y+h/2+20}" text-anchor="middle">${count} observation(s)</text></g>`;
  }).join('');
  const mapPins = obs.filter(o => o.zone_id && o.review_status !== 'dismissed').map((o, i) => {
    const z = zones.find(x => x.id === o.zone_id); if (!z) return '';
    const x = (Number(z.x) + Number(z.width)/2) * 10 + ((i%3)-1)*23;
    const y = (Number(z.y) + Number(z.height)/2) * 6 + (Math.floor(i/3)%2)*20;
    const fill = o.review_status === 'resolved' ? '#16c98b' : o.review_status === 'confirmed' ? '#f04452' : '#f5a623';
    return `<g class="blueprint-observation-pin" data-map-observation="${esc(o.id)}" tabindex="0" role="button" aria-label="Open ${esc(o.category)} observation"><circle class="map-pin" cx="${x}" cy="${y}" r="14" fill="${fill}"/><text x="${x}" y="${y+4}" font-size="12" font-weight="900" text-anchor="middle" fill="#fff">!</text></g>`;
  }).join('');
  const cameraPins = cameras.map((c, i) => {
    const z = zones.find(x => x.id === c.zone_id); if (!z) return '';
    const x = (Number(z.x) + Number(z.width)*.78) * 10;
    const y = (Number(z.y) + Number(z.height)*.22) * 6;
    return `<g class="blueprint-camera-pin" transform="translate(${x} ${y})"><circle r="13" fill="#147bd1" stroke="#d7efff" stroke-width="3"/><text y="4" text-anchor="middle" font-size="10" fill="#fff">C</text><title>${esc(c.camera_code)} · ${esc(c.name)}</title></g>`;
  }).join('');
  const aerialPins = zones.map((z, i) => {
    const related = obs.filter(o => o.zone_id === z.id && o.review_status !== 'dismissed');
    const fill = related.some(o=>o.review_status==='confirmed') ? 'pin-red' : related.length ? 'pin-orange' : 'pin-green';
    const left = Math.min(91, Math.max(8, Number(z.x)+Number(z.width)/2));
    const top = Math.min(88, Math.max(10, Number(z.y)+Number(z.height)/2));
    return `<button class="aerial-zone-pin ${fill}" style="left:${left}%;top:${top}%" data-zone="${esc(z.id)}" type="button" aria-label="${esc(z.name)}"><span>${related.length ? related.length : '✓'}</span><small>${esc(z.name)}</small></button>`;
  }).join('');
  const svg = `<svg viewBox="0 0 1000 620" role="img" aria-label="Configured construction site blueprint with camera and observation markers"><defs><pattern id="siteGrid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#274866" stroke-width="1"/></pattern></defs><rect width="1000" height="620" fill="#071c32"/><rect width="1000" height="620" fill="url(#siteGrid)"/><path d="M20 20H980V600H20Z" fill="none" stroke="#6585a4" stroke-width="5" stroke-dasharray="13 8"/><path d="M0 302H1000M492 0V620" stroke="#254767" stroke-width="30"/><path d="M0 302H1000M492 0V620" stroke="#8aa6c3" stroke-width="2" stroke-dasharray="12 11"/>${zoneRects}${mapPins}${cameraPins}<text x="500" y="610" text-anchor="middle" font-size="12" fill="#9bb6d0" font-weight="700">CONFIGURED SITE BLUEPRINT · NOT TO SCALE</text></svg>`;
  return `<div class="dual-map-view">
    <section class="map-visual aerial-map-visual"><div class="map-visual-head"><strong>◉ Aerial location view</strong><span>Illustrative site imagery · not live GPS</span></div><div class="aerial-map-canvas"><img src="/assets/construction-aerial.webp" alt="Illustrative aerial image of a construction site"><div class="aerial-map-vignette"></div>${aerialPins}<div class="aerial-map-legend"><span><i class="pin-dot dot-red"></i>Needs review</span><span><i class="pin-dot dot-green"></i>Clear / resolved</span><span><i class="pin-dot dot-blue"></i>Configured zone</span></div></div></section>
    <section class="map-visual blueprint-map-visual"><div class="map-visual-head"><strong>▦ Site blueprint</strong><span>Zones · cameras · observations</span></div><div class="blueprint-canvas" id="siteBlueprint">${svg}</div></section>
  </div>`;
}

async function renderMap() {
  if (!sites.length) return `${pageHeading('Location intelligence','Smart Site Map','Create a construction site before placing zones.')}${emptyState('No sites found','Add a site in Site Management.')}`;
  const currentId = selectedMapSite || sites[0].id;
  selectedMapSite = currentId;
  let data;
  try { data = await API.get(`/api/sites/${encodeURIComponent(currentId)}/map`); }
  catch (err) { return `${pageHeading('Location intelligence','Smart Site Map','Could not load site map data.')}<div class="callout danger-callout">${esc(err.message)}</div>`; }
  const activeObs = data.observations.filter(o => o.review_status !== 'dismissed');
  const zoneRows = data.zones.map(z => {
    const count = activeObs.filter(o => o.zone_id === z.id).length;
    return `<div class="zone-summary-row"><span>${esc(z.name)}</span><strong>${count}</strong></div>`;
  }).join('');
  const recent = activeObs.slice(0,5).map(o => `<div class="doc-row"><div class="doc-icon" style="background:${o.review_status==='resolved'?'#e7f8ef':'#fff2df'};color:${o.review_status==='resolved'?'#159b61':'#b87919'}">${iconFor(o.category)}</div><div><strong>${esc(o.category)}</strong><small>${esc(o.zone_name || 'Unmapped')} · ${fmtTime(o.timestamp)}</small></div><span class="spacer"></span>${statusBadge(o.review_status)}</div>`).join('');
  view.innerHTML = `${pageHeading('Location intelligence','Smart Site Map','Explore configured site zones, camera coverage and inspection observations.', `<a href="#sites" class="btn btn-secondary">Manage Sites</a>`)}
    <div class="flex-between mb-12"><div><strong class="small">Selected construction site</strong><div class="small muted">${esc(data.site.location || 'Location not specified')}</div></div><select class="select-small" id="mapSiteSelect">${sites.map(s=>`<option value="${esc(s.id)}" ${s.id===currentId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div class="map-layout"><div class="site-map-stage">${renderMapSvg(data)}</div><aside class="map-side"><article class="panel"><h3 class="card-title">Zone Summary</h3><p class="card-description">Open observations by configured zone</p><div class="zone-summary mt-16">${zoneRows || '<span class="muted small">No zones configured.</span>'}</div></article><article class="panel"><h3 class="card-title">Map Legend</h3><div class="legend-list mt-16"><div class="legend-row"><i class="legend-mark" style="background:#d94141"></i>Confirmed observation</div><div class="legend-row"><i class="legend-mark" style="background:#ef9e2f"></i>Needs human review</div><div class="legend-row"><i class="legend-mark" style="background:#159b61"></i>Resolved observation</div><div class="legend-row"><i class="legend-mark" style="background:#416a86"></i>Configured site zone</div></div></article><article class="panel"><h3 class="card-title">Recent Map Observations</h3><div class="mt-12">${recent || '<span class="muted small">No observations are mapped yet.</span>'}</div></article><p class="map-note">This is a manually configured 2D site blueprint, not a live GPS map. Assign camera feeds to zones only after confirming their physical coverage.</p></aside></div>`;
  bindMapInteractions(data);
}

function bindMapInteractions(data) {
  $('#mapSiteSelect')?.addEventListener('change', e => { selectedMapSite = e.target.value; render(); });
  $$('.map-visual').forEach((node, index) => node.addEventListener('click', event => { if (event.target.closest('[data-zone]')) return; node.classList.toggle('map-visual-focused'); }));
  $$('#siteBlueprint [data-zone], .aerial-map-canvas [data-zone]').forEach(node => node.addEventListener('click', () => {
    const zone = data.zones.find(z => z.id === node.dataset.zone);
    const count = data.observations.filter(o => o.zone_id === zone.id).length;
    toast(`${zone.name}: ${count} observation(s) currently linked to this zone.`);
  }));
}

function renderSops() {
  const textPages = sops.reduce((total, item) => total + Number(item.page_count || 0), 0);
  const linkedObservations = observations.filter(item => item.sop_reference && String(item.sop_reference).trim());
  const docs = sops.map(s => {
    const siteName = sites.find(site => site.id === s.site_id)?.name || (s.site_id ? 'Assigned site' : 'All sites');
    return `<article class="sop-document-row">
      <div class="sop-pdf-icon">PDF</div>
      <div class="sop-document-copy"><strong>${esc(s.filename)}</strong><small>${Number(s.page_count || 0)} text page(s) · ${esc(siteName)} · ${esc(fmtDate(s.uploaded_at))}</small></div>
      <span class="status ${Number(s.page_count || 0) > 0 ? 'status-resolved' : 'status-review'}">${Number(s.page_count || 0) > 0 ? 'Text indexed' : 'No text found'}</span>
    </article>`;
  }).join('');
  const matches = linkedObservations.slice(0, 4).map(item => `<div class="sop-match-row">
    <span class="sop-match-icon">✓</span><div><strong>${esc(item.category)} · ${esc(item.observation)}</strong><small>${esc(item.site_name || 'Site')} · ${esc(item.sop_reference)}</small></div>
  </div>`).join('');

  return `${pageHeading('Safety knowledge','Safety SOPs','Build a searchable safety library and connect inspection observations to documented procedures.', '<a class="btn btn-secondary" href="#actions">Open Action Center →</a>')}
    <section class="sop-intro-strip">
      <div class="sop-intro-mark">▤</div>
      <div class="sop-intro-copy"><strong>One source of truth for site safety procedures</strong><span>Upload approved manuals, extract selectable PDF text, and keep page references available during human review.</span></div>
      <div class="sop-intro-chips"><span>PDF library</span><span>Page references</span><span>Human verified</span></div>
    </section>

    <section class="sop-metrics-grid" aria-label="Safety document statistics">
      <article class="sop-metric-card"><div class="sop-metric-top"><span>Indexed manuals</span><i class="sop-metric-icon blue">▤</i></div><strong>${sops.length}</strong><small>Documents in your library</small></article>
      <article class="sop-metric-card"><div class="sop-metric-top"><span>Text pages extracted</span><i class="sop-metric-icon cyan">≡</i></div><strong>${textPages}</strong><small>Selectable PDF pages stored</small></article>
      <article class="sop-metric-card"><div class="sop-metric-top"><span>Observations with SOP references</span><i class="sop-metric-icon green">✓</i></div><strong>${linkedObservations.length}</strong><small>Saved inspection references</small></article>
    </section>

    <section class="sop-main-grid">
      <article class="panel sop-upload-panel" id="sopUploadCard">
        <div class="sop-panel-heading"><div><span class="sop-kicker">ADD TO YOUR LIBRARY</span><h3 class="card-title">Upload Safety Manual</h3><p class="card-description">Choose the construction site this procedure applies to, then upload a text-based PDF.</p></div><span class="sop-heading-icon">↑</span></div>
        <form id="sopForm" class="sop-upload-form">
          <div class="field"><label for="sopSite">Apply to site</label><select id="sopSite"><option value="">All sites</option>${sites.map(site=>`<option value="${esc(site.id)}">${esc(site.name)}</option>`).join('')}</select><small class="sop-field-help">Choose “All sites” for company-wide procedures.</small></div>
          <label for="sopFile" id="sopDrop" class="file-drop sop-drop">
            <span class="sop-upload-symbol">↑</span><strong>Drag and drop your safety PDF</strong><span class="sop-drop-or">or <u>browse files</u></span><small>PDF only · Text-based PDFs work best · Max size is set by the server</small>
            <input type="file" id="sopFile" accept="application/pdf,.pdf" required>
          </label>
          <div class="sop-selected-file"><span class="sop-selected-file-icon">PDF</span><span id="sopFilename">No file selected</span><span class="sop-selected-hint">Ready to upload</span></div>
          <div class="sop-upload-actions"><button class="btn btn-primary" type="submit">Upload & Extract Text <span aria-hidden="true">→</span></button><span class="sop-secure-note">Files stay in your local KAVACH360 workspace.</span></div>
        </form>
      </article>

      <article class="panel sop-library-panel">
        <div class="sop-panel-heading"><div><span class="sop-kicker">DOCUMENT LIBRARY</span><h3 class="card-title">Uploaded Documents</h3><p class="card-description">${sops.length} manual(s) indexed and available for matching.</p></div><span class="sop-library-count">${String(sops.length).padStart(2,'0')}</span></div>
        ${docs ? `<div class="sop-document-list">${docs}</div>` : `<div class="sop-empty-library"><div class="sop-empty-graphic"><span>PDF</span><i>＋</i></div><strong>Your safety library is empty</strong><p>Upload your first site safety manual to make approved procedures searchable during inspection reviews.</p><button class="btn btn-secondary btn-small" type="button" data-focus-sop>Choose a PDF</button></div>`}
        <div class="sop-library-foot"><span class="sop-library-dot"></span>Local document index <strong>${sops.length ? 'Active' : 'Waiting for first upload'}</strong></div>
      </article>
    </section>

    <section class="sop-lower-grid">
      <article class="panel sop-how-panel">
        <div class="sop-section-heading"><div><span class="sop-kicker">HOW IT WORKS</span><h3 class="card-title">From manual to useful guidance</h3></div><span class="sop-step-label">3 STEPS</span></div>
        <div class="sop-steps-grid">
          <div class="sop-step-card"><span class="sop-step-number">01</span><span class="sop-step-icon">↑</span><strong>Upload the manual</strong><p>Add the approved PDF and assign it to one site or all sites.</p></div>
          <div class="sop-step-card"><span class="sop-step-number">02</span><span class="sop-step-icon">≡</span><strong>Extract page text</strong><p>KAVACH360 stores selectable text with its original page number.</p></div>
          <div class="sop-step-card"><span class="sop-step-number">03</span><span class="sop-step-icon">⌕</span><strong>Match during review</strong><p>Relevant text can be shown beside an observation for supervisor verification.</p></div>
        </div>
      </article>
      <article class="panel sop-reference-panel">
        <div class="sop-section-heading"><div><span class="sop-kicker">TRACEABLE REFERENCES</span><h3 class="card-title">Observation links</h3></div><span class="sop-reference-badge">${linkedObservations.length} linked</span></div>
        ${matches ? `<div class="sop-match-list">${matches}</div>` : `<div class="sop-no-matches"><span>⌕</span><div><strong>No SOP-linked observations yet</strong><p>${sops.length ? 'Run an inspection and review its saved rule references here.' : 'Upload a manual first. New inspection observations can then be matched against its extracted text.'}</p></div></div>`}
      </article>
    </section>

    <div class="callout sop-caution"><strong>Important:</strong> This MVP extracts selectable text only; scanned/image-only PDFs may return zero text pages because OCR is not enabled. Rule matches are references for human review, not proof of compliance. Always verify the cited page in the original approved document.</div>`;
}

function renderActions() {
  const rowsHtml = actions.map(a => `<tr><td class="table-name">${esc(shortId(a.id))}</td><td><div class="table-name">${esc(a.category)}: ${esc(a.observation)}</div><div class="table-sub">${esc(a.inspection_name)} · ${esc(a.site_name)}</div></td><td>${esc(a.zone_name || 'Unmapped')}</td><td>${esc(a.assigned_to || 'Unassigned')}</td><td>${esc(a.due_date || '—')}</td><td><select class="select-small" data-action-status="${esc(a.id)}"><option ${a.status==='Pending'?'selected':''}>Pending</option><option ${a.status==='In Progress'?'selected':''}>In Progress</option><option ${a.status==='Resolved'?'selected':''}>Resolved</option></select></td><td><button class="btn btn-secondary btn-small" data-open-observation="${esc(a.observation_id)}">View</button></td></tr>`).join('');
  const pending = observations.filter(o=>o.review_status==='needs_review').length;
  return `${pageHeading('Follow-up workflow','Action Center','Verify observations and track corrective actions through resolution.')}
    <div class="stats-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><article class="stat-card"><div class="stat-top">Needs Review <span class="stat-icon tone-orange">◷</span></div><div class="stat-value">${pending}</div><div class="stat-foot">Waiting for human decision</div></article><article class="stat-card"><div class="stat-top">Open Actions <span class="stat-icon tone-blue">↗</span></div><div class="stat-value">${actions.filter(a=>a.status!=='Resolved').length}</div><div class="stat-foot">Pending or in progress</div></article><article class="stat-card"><div class="stat-top">Resolved Actions <span class="stat-icon tone-green">✓</span></div><div class="stat-value">${actions.filter(a=>a.status==='Resolved').length}</div><div class="stat-foot">Marked resolved by a user</div></article></div>
    <article class="panel"><div class="panel-header"><div><h3>Corrective Action Tracker</h3><p class="panel-subtitle">Update a task using the status selector.</p></div><span class="count-pill"><strong>${actions.length}</strong> actions</span></div><div class="table-wrap"><table><thead><tr><th>Action ID</th><th>Observation</th><th>Zone</th><th>Assigned To</th><th>Due Date</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="7">${emptyState('No corrective actions','Create an action from a reviewed observation.')}</td></tr>`}</tbody></table></div></article>
    <article class="panel mt-16"><div class="panel-header"><div><h3>Observations awaiting review</h3><p class="panel-subtitle">A human reviewer must make the final decision.</p></div></div><div class="observation-list">${observations.filter(o=>o.review_status==='needs_review').slice(0,5).map(o=>`<div class="observation-card"><div class="observation-icon">${iconFor(o.category)}</div><div><h4>${esc(o.observation)}</h4><p>${esc(o.site_name || '')} · ${esc(o.zone_name || 'Unmapped zone')} · ${fmtTime(o.timestamp)}</p></div><button class="btn btn-primary btn-small" data-open-observation="${esc(o.id)}">Review</button></div>`).join('') || emptyState('All caught up','No observations are currently waiting for review.')}</div></article>`;
}

function renderReports() {
  const reportRows = reports.map(r=>`<tr><td class="table-name">${esc(shortId(r.id))}</td><td>${esc(r.inspection_name)}</td><td>${esc(r.site_name)}</td><td>${esc(fmtDate(r.created_at))}</td><td><a class="btn btn-secondary btn-small" href="${esc(r.download_url)}" target="_blank" rel="noopener">Download PDF</a></td></tr>`).join('');
  const completed = inspections.filter(i=>i.status==='completed');
  return `${pageHeading('Documentation','Inspection Reports','Generate a shareable PDF summary from saved inspection observations.')}
    <article class="panel"><div class="panel-header"><div><h3>Generate New Report</h3><p class="panel-subtitle">Choose a completed inspection. Reports include observations, review states, uncertainty notes and corrective actions.</p></div></div><form id="reportForm" class="form-grid"><div class="field"><label for="reportInspection">Inspection</label><select id="reportInspection" required><option value="">Select completed inspection</option>${completed.map(i=>`<option value="${esc(i.id)}">${esc(i.name)} — ${esc(i.site_name)}</option>`).join('')}</select></div><div class="field" style="align-self:end"><button class="btn btn-primary" type="submit" ${completed.length?'':'disabled'}>Generate PDF Report →</button></div></form></article>
    <article class="panel mt-16"><div class="panel-header"><div><h3>Generated Reports</h3><p class="panel-subtitle">Saved PDF inspection reports</p></div></div><div class="table-wrap"><table><thead><tr><th>Report ID</th><th>Inspection</th><th>Site</th><th>Generated</th><th></th></tr></thead><tbody>${reportRows || `<tr><td colspan="5">${emptyState('No reports yet','Generate a report from a completed inspection.')}</td></tr>`}</tbody></table></div></article>`;
}

function siteThumbnail() { return miniBlueprint().replace('viewBox="0 0 520 240"','viewBox="0 0 520 240"'); }
function renderSites() {
  const cards = sites.map(s=>`<article class="site-card"><div class="site-card-top"><h3>${esc(s.name)}</h3><span class="status status-resolved">${esc(s.status)}</span></div><p>⌖ ${esc(s.location || 'Location not specified')}</p><div class="site-thumb">${siteThumbnail()}</div><div class="site-metrics"><span>▦ ${s.zone_count || 0} zones</span><span>▣ ${s.camera_count || 0} cameras</span></div><div class="site-actions"><a class="btn btn-soft btn-small" href="#map" data-select-site="${esc(s.id)}">View Map</a><button class="btn btn-secondary btn-small" data-manage-cameras="${esc(s.id)}">Cameras</button></div></article>`).join('');
  return `${pageHeading('Workspace setup','Site Management','Manage construction sites and their manually configured map zones.', `<button class="btn btn-primary" id="addSiteButton">＋ Add Site</button>`)}
    <div class="site-grid">${cards || emptyState('No sites created','Add your first construction site.')}</div>
    <div class="callout mt-16">New sites are created with four starter zones. Use the site map as an illustrative blueprint and verify zone positions with the site team before relying on it.</div>`;
}

function renderSettings() {
  const installed = (health.installed_models || []).map(x=>`<span class="count-pill">${esc(x)}</span>`).join(' ') || '<span class="muted small">Model list unavailable</span>';
  return `${pageHeading('Configuration','Settings','Check local services and configure your model in the backend .env file.')}
    <div class="sop-grid"><article class="panel"><h3 class="card-title">Backend API</h3><div class="doc-row"><div class="doc-icon" style="background:#e7f8ef;color:#159b61">✓</div><div><strong>FastAPI service</strong><small>${health.api==='online'?'Connected':'Status unavailable'}</small></div>${statusBadge(health.api==='online'?'completed':'failed')}</div><h3 class="card-title mt-16">Ollama Connection</h3><div class="doc-row"><div class="doc-icon">AI</div><div><strong>${esc(health.model || 'Gemma model')}</strong><small>${health.ollama==='connected'?'Ollama server is reachable':'Ollama server is not reachable'}</small></div>${statusBadge(health.ollama==='connected'?'completed':'failed')}</div><div class="doc-row"><div class="doc-icon">G</div><div><strong>Model installed</strong><small>${health.model_available?'Configured model is available':'Pull the model shown below'}</small></div>${statusBadge(health.model_available?'completed':'needs_review')}</div><div class="mt-12">${installed}</div></article>
    <article class="panel"><h3 class="card-title">Local setup commands</h3><p class="card-description">Run these in Terminal. On macOS, use a recent Ollama release for Gemma 4 support.</p><pre class="code-block">ollama --version\nollama pull gemma4:e2b\nollama list</pre><p class="small muted">Then set OLLAMA_MODEL=gemma4:e2b in your root .env file and restart the backend.</p><button class="btn btn-secondary mt-12" id="refreshHealth">↻ Refresh connection status</button></article></div>
    <div class="callout mt-16">Never expose private worker footage or model credentials publicly. The app stores uploaded files locally under the project storage folder. Add an appropriate retention policy before real site deployment.</div>`;
}

async function openCameraManager(siteId) {
  try {
    const data = await API.get(`/api/sites/${encodeURIComponent(siteId)}/map`);
    const cameraRows = data.cameras.map(c => `<div class="doc-row"><div class="doc-icon">CAM</div><div><strong>${esc(c.camera_code)} · ${esc(c.name)}</strong><small>Zone: ${esc(data.zones.find(z=>z.id===c.zone_id)?.name || 'Unassigned')}</small></div></div>`).join('');
    showModal(`<div class="eyebrow">Site configuration</div><h3>Camera-to-zone mapping</h3><p>Each camera is associated with one manually verified site zone. Observations from that camera inherit this zone context.</p><div class="detail-list">${cameraRows || '<p class="small muted">No cameras configured yet.</p>'}</div><form id="cameraForm" data-site="${esc(siteId)}" class="form-grid mt-16"><div class="field"><label>Camera name *</label><input name="name" required placeholder="Electrical Zone Camera"></div><div class="field"><label>Camera code *</label><input name="camera_code" required placeholder="CAM-05"></div><div class="field full"><label>Covered zone *</label><select name="zone_id" required>${data.zones.map(z=>`<option value="${esc(z.id)}">${esc(z.name)}</option>`).join('')}</select></div><div class="field full modal-actions"><button type="button" class="btn btn-secondary" data-close-modal>Close</button><button type="submit" class="btn btn-primary">Add Camera Mapping</button></div></form>`);
  } catch (err) { toast(err.message,'error'); }
}

async function openObservation(id) {
  const o = observations.find(x => x.id === id) || await API.get('/api/observations').then(list=>list.find(x=>x.id===id));
  if (!o) return toast('Observation not found.', 'error');
  selectedObservation = o;
  const evidence = o.evidence_url ? `<img src="${esc(o.evidence_url)}" alt="Inspection frame evidence" style="width:100%;max-height:220px;object-fit:contain;background:#0b1b29;border-radius:8px">` : `<div class="evidence-placeholder"><div><strong>▧</strong>No evidence frame attached to this record.<br>Sample data is illustrative only.</div></div>`;
  showModal(`<div class="flex-between"><div><div class="eyebrow">Observation review</div><h3>${esc(o.category)}</h3></div>${statusBadge(o.review_status)}</div><div class="mt-12">${evidence}</div><div class="detail-list"><div class="detail-item"><label>Observation</label><p>${esc(o.observation)}</p></div><div class="detail-item"><label>Visible evidence</label><p>${esc(o.evidence_description || 'Not provided')}</p></div><div class="detail-item"><label>Uncertainty</label><p>${esc(o.uncertainty || 'Not recorded')}</p></div><div class="detail-item"><label>Timestamp / Zone</label><p>${fmtTime(o.timestamp)} · ${esc(o.zone_name || 'Unmapped')}</p></div><div class="detail-item"><label>Suggested action</label><p>${esc(o.recommended_action || 'Ask a qualified site supervisor to review.')}</p></div><div class="detail-item"><label>Safety manual reference</label><p>${esc(o.sop_reference || 'No matching uploaded SOP reference found.')}</p></div></div><div class="modal-actions"><button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-secondary" data-review="dismissed" data-observation="${esc(o.id)}">Dismiss</button><button class="btn btn-soft" data-review="needs_review" data-observation="${esc(o.id)}">Needs more evidence</button><button class="btn btn-primary" data-review="confirmed" data-observation="${esc(o.id)}">Confirm</button><button class="btn btn-success" data-create-action="${esc(o.id)}">＋ Create action</button></div>`);
}

async function loadAnalysisDetails(id) {
  try {
    const bundle = await API.get(`/api/inspections/${encodeURIComponent(id)}`);
    const ins = bundle.inspection;
    const statusText = $('#analysisStatusText');
    const percent = $('#analysisPercent');
    const bar = $('#analysisProgress');
    if (statusText) statusText.textContent = ins.status === 'completed' ? 'Analysis completed' : ins.status === 'failed' ? ins.error_message || 'Analysis failed' : `Status: ${ins.status}`;
    if (percent) percent.textContent = ins.status === 'completed' ? '100%' : ins.status === 'failed' ? 'Error' : 'Processing';
    if (bar) bar.style.width = ins.status === 'completed' ? '100%' : ins.status === 'failed' ? '0%' : ins.status === 'analyzing' ? '64%' : '30%';
    const host = $('#analysisObservations');
    if (host) {
      host.innerHTML = bundle.observations.length ? `<div class="observation-list">${bundle.observations.map(o=>`<div class="observation-card"><div class="observation-icon">${iconFor(o.category)}</div><div><h4>${esc(o.category)} · ${esc(o.observation)}</h4><p>${esc(o.evidence_description)}</p><div class="observation-meta"><span>${fmtTime(o.timestamp)}</span><span>${esc(o.zone_name || 'Unmapped')}</span></div></div><button class="btn btn-secondary btn-small" data-open-observation="${esc(o.id)}">Review</button></div>`).join('')}</div>` : ins.status === 'completed' ? emptyState('No concerns returned by the model','No potential observations were recorded. This does not certify that the site is safe.') : '<div class="small muted">Frames and observations will appear here as analysis completes.</div>';
    }
    if (ins.status === 'completed' || ins.status === 'failed') {
      clearInterval(analysisTimer); analysisTimer = null;
      await refreshCore();
      updateConnection();
    }
  } catch (err) { toast(err.message, 'error'); }
}

function navigate(route) { location.hash = route; }
async function render() {
  clearInterval(analysisTimer); analysisTimer = null;
  const raw = location.hash.replace(/^#/, '') || 'dashboard';
  const [route, id] = raw.split('/');
  $$('.nav-link[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route || (route === 'analysis' && link.dataset.route === 'inspections')));
  $('#sidebar').classList.remove('open');
  if (route === 'dashboard') view.innerHTML = renderDashboard();
  else if (route === 'inspections') view.innerHTML = renderInspections();
  else if (route === 'analysis') {
    view.innerHTML = renderAnalysis(id);
    if (id) { await loadAnalysisDetails(id); if (['queued','analyzing'].includes(inspections.find(x=>x.id===id)?.status)) analysisTimer = setInterval(()=>loadAnalysisDetails(id), 4000); }
  }
  else if (route === 'hazards') view.innerHTML = renderHazards();
  else if (route === 'map') await renderMap();
  else if (route === 'sops') view.innerHTML = renderSops();
  else if (route === 'actions') view.innerHTML = renderActions();
  else if (route === 'reports') view.innerHTML = renderReports();
  else if (route === 'sites') view.innerHTML = renderSites();
  else if (route === 'settings') view.innerHTML = renderSettings();
  else { view.innerHTML = renderDashboard(); }
  $('#todayDate').textContent = new Date().toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
  bindPage();
  updateConnection();
}

async function submitInspection(form) {
  const submit = $('#startInspectionBtn');
  const file = $('#videoFile').files[0];
  if (!file) return toast('Choose a construction video first.', 'error');
  submit.disabled = true; submit.textContent = 'Creating inspection…';
  let created = null;
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    created = await API.post('/api/inspections', { site_id:data.site_id, name:data.name, description:data.description || '', camera_id:data.camera_id || null });
    $('#uploadStatus').textContent = 'Uploading video…';
    const body = new FormData(); body.append('file', file);
    await API.upload(`/api/inspections/${created.id}/video`, body);
    $('#uploadStatus').textContent = 'Starting Gemma 4 analysis…';
    await API.post(`/api/inspections/${created.id}/analyze`, {});
    await refreshCore(); toast('Video uploaded and analysis queued.', 'success'); navigate(`analysis/${created.id}`);
  } catch (err) {
    toast(err.message, 'error'); $('#uploadStatus').textContent = err.message;
    if (created) {
      await refreshCore();
      navigate(`analysis/${created.id}`);
      if (err.message.toLowerCase().includes('ollama') || err.message.toLowerCase().includes('model')) toast('Inspection and video are saved. Connect Ollama, install Gemma 4, then use Run Analysis on this page.', 'normal');
    }
  } finally { submit.disabled = false; submit.textContent = 'Start Inspection →'; }
}

async function handleSubmit(event) {
  const form = event.target;
  if (form.id === 'inspectionForm') { event.preventDefault(); await submitInspection(form); }
  if (form.id === 'sopForm') {
    event.preventDefault(); const file = $('#sopFile').files[0]; if (!file) return toast('Choose a PDF safety manual.', 'error');
    const fd = new FormData(); fd.append('file', file); if ($('#sopSite').value) fd.append('site_id', $('#sopSite').value);
    const btn = $('button[type="submit"]', form); btn.disabled = true; btn.textContent = 'Extracting…';
    try { const result = await API.upload('/api/sops', fd); await refreshCore(); toast(`Uploaded ${result.filename}; extracted ${result.text_pages_found} text page(s).`, 'success'); render(); }
    catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; btn.textContent = 'Upload & Extract Text'; }
  }
  if (form.id === 'siteForm') {
    event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries());
    try { const site = await API.post('/api/sites', data); await refreshCore(); toast('Construction site created.', 'success'); closeModal(); selectedMapSite = site.id; render(); }
    catch (err) { toast(err.message, 'error'); }
  }
  if (form.id === 'cameraForm') {
    event.preventDefault(); const data=Object.fromEntries(new FormData(form).entries()); const siteId=form.dataset.site;
    try { await API.post(`/api/sites/${siteId}/cameras`, data); await refreshCore(); toast('Camera mapped to site zone.','success'); closeModal(); render(); }
    catch (err) { toast(err.message,'error'); }
  }
  if (form.id === 'actionForm') {
    event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries()); const obsId = form.dataset.observation;
    try { await API.post(`/api/observations/${obsId}/actions`, data); await refreshCore(); toast('Corrective action created.', 'success'); closeModal(); render(); }
    catch (err) { toast(err.message, 'error'); }
  }
  if (form.id === 'reportForm') {
    event.preventDefault(); const inspectionId = $('#reportInspection').value; if (!inspectionId) return;
    try { const report = await API.post(`/api/inspections/${inspectionId}/report`, {}); await refreshCore(); toast('PDF report generated.', 'success'); window.open(report.download_url, '_blank', 'noopener'); render(); }
    catch (err) { toast(err.message, 'error'); }
  }
}

async function handleClick(event) {
  const target = event.target.closest('button, a, [data-map-observation], [data-zone]');
  if (!target) return;
  if (target.matches('[data-close-modal]') || target.id === 'modalBackdrop') { closeModal(); return; }
  if (target.id === 'menuToggle') { $('#sidebar').classList.toggle('open'); return; }
  if (target.id === 'notificationButton') { toast('No new notifications.'); return; }
  if (target.matches('[data-focus-sop]')) { $('#sopFile')?.click(); return; }
  if (target.id === 'addSiteButton') {
    showModal(`<div class="eyebrow">Site management</div><h3>Add construction site</h3><p>Create a site with a starter set of manually configurable zones.</p><form id="siteForm" class="form-grid"><div class="field full"><label>Site name *</label><input name="name" required minlength="2" placeholder="e.g. Tower Block B"></div><div class="field full"><label>Location</label><input name="location" placeholder="City, state"></div><div class="field full modal-actions"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">Create site</button></div></form>`); return;
  }
  if (target.matches('[data-open-inspection]')) { navigate(`analysis/${target.dataset.openInspection}`); return; }
  if (target.matches('[data-open-observation]')) { await openObservation(target.dataset.openObservation); return; }
  if (target.matches('[data-review]')) {
    const id = target.dataset.observation; const status = target.dataset.review;
    try { await API.patch(`/api/observations/${id}/review`, { status, reviewer_note:'' }); await refreshCore(); closeModal(); toast(`Observation marked ${statusLabel(status).toLowerCase()}.`, 'success'); render(); }
    catch (err) { toast(err.message, 'error'); } return;
  }
  if (target.matches('[data-create-action]')) {
    const id = target.dataset.createAction;
    showModal(`<div class="eyebrow">Corrective action</div><h3>Create action</h3><p>Assign a follow-up task for this observation.</p><form id="actionForm" data-observation="${esc(id)}" class="form-grid"><div class="field full"><label>Assigned to</label><input name="assigned_to" placeholder="Supervisor name or role"></div><div class="field full"><label>Due date</label><input type="date" name="due_date"></div><div class="field full"><label>Action notes</label><textarea name="notes" placeholder="What needs to be checked or corrected?"></textarea></div><div class="field full modal-actions"><button type="button" class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">Create action</button></div></form>`); return;
  }
  if (target.matches('[data-start-analysis]')) {
    try { await API.post(`/api/inspections/${target.dataset.startAnalysis}/analyze`, {}); await refreshCore(); toast('Gemma 4 analysis queued.', 'success'); render(); }
    catch (err) { toast(err.message, 'error'); } return;
  }
  if (target.matches('[data-refresh-analysis]')) { await refreshCore(); render(); return; }
  if (target.matches('[data-select-site]')) { selectedMapSite = target.dataset.selectSite; }
  if (target.matches('[data-manage-cameras]')) { await openCameraManager(target.dataset.manageCameras); return; }
  if (target.id === 'refreshHealth') { await refreshCore(); toast('Connection status refreshed.'); render(); return; }
  if (target.id === 'globalSearch') return;
}

function bindPage() {
  const videoInput = $('#videoFile');
  if (videoInput && !videoInput.dataset.bound) { videoInput.dataset.bound = '1'; videoInput.addEventListener('change', event => {
    const file = event.target.files[0]; if (!file) return;
    $('#videoFileName').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    const preview = $('#videoPreview'); preview.src = URL.createObjectURL(file); preview.classList.remove('hidden');
  }); }
  const drop = $('#videoDrop');
  if (drop && !drop.dataset.bound) { drop.dataset.bound = '1';
    ['dragenter','dragover'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('dragover');}));
    ['dragleave','drop'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('dragover');}));
    drop.addEventListener('drop', e=>{const input=$('#videoFile');if(e.dataTransfer.files.length){input.files=e.dataTransfer.files;input.dispatchEvent(new Event('change'));}});
  }
  const sopInput = $('#sopFile');
  if (sopInput && !sopInput.dataset.bound) {
    sopInput.dataset.bound = '1';
    sopInput.addEventListener('change', e => {
      const file = e.target.files[0];
      const name = $('#sopFilename');
      if (name) name.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'No file selected';
      const drop = $('#sopDrop');
      if (drop) drop.classList.toggle('has-file', !!file);
    });
  }
  const sopDrop = $('#sopDrop');
  if (sopDrop && !sopDrop.dataset.bound) {
    sopDrop.dataset.bound = '1';
    ['dragenter','dragover'].forEach(type => sopDrop.addEventListener(type, e => { e.preventDefault(); sopDrop.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(type => sopDrop.addEventListener(type, e => { e.preventDefault(); sopDrop.classList.remove('dragover'); }));
    sopDrop.addEventListener('drop', e => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return toast('Please choose a PDF safety manual.', 'error');
      const transfer = new DataTransfer(); transfer.items.add(file); sopInput.files = transfer.files; sopInput.dispatchEvent(new Event('change', { bubbles:true }));
    });
  }
  const statusFilter = $('#hazardStatusFilter'); if (statusFilter && !statusFilter.dataset.bound) { statusFilter.dataset.bound = '1'; statusFilter.addEventListener('change', filterHazards); }
  const categoryFilter = $('#hazardCategoryFilter'); if (categoryFilter && !categoryFilter.dataset.bound) { categoryFilter.dataset.bound = '1'; categoryFilter.addEventListener('change', filterHazards); }
  const search = $('#globalSearch'); if (search && !search.dataset.bound) { search.dataset.bound = '1'; search.addEventListener('input', e => {
    const term = e.target.value.toLowerCase().trim();
    $$('[data-searchable]').forEach(row=>row.classList.toggle('hidden', !!term && !row.dataset.searchable.includes(term)));
  }); }
  const siteSelect = $('#inspectionSite'); if (siteSelect && !siteSelect.dataset.bound) { siteSelect.dataset.bound = '1'; siteSelect.addEventListener('change', async e => {
    try {
      const map = await API.get(`/api/sites/${encodeURIComponent(e.target.value)}/map`);
      $('#cameraZone').innerHTML = '<option value="">Use site default zone</option>' + map.cameras.map(c=>`<option value="${esc(c.id)}">${esc(c.camera_code)} · ${esc(c.name)}</option>`).join('');
    } catch { /* camera selection remains optional */ }
  }); if (siteSelect.value) siteSelect.dispatchEvent(new Event('change')); }
}

function filterHazards() {
  const status = $('#hazardStatusFilter')?.value || ''; const category = $('#hazardCategoryFilter')?.value || '';
  $$('#observationList .observation-card').forEach((card, index) => {
    const o = observations[index]; card.classList.toggle('hidden', (!!status && o?.review_status !== status) || (!!category && o?.category !== category));
  });
}

// Clear any stale modal state on a fresh page load. The modal opens only
// after an explicit user action via showModal().
const initialModalBackdrop = document.getElementById('modalBackdrop');
if (initialModalBackdrop) {
  initialModalBackdrop.hidden = true;
  initialModalBackdrop.setAttribute('hidden', '');
}

// Event delegation keeps navigation and actions working after each view render.
document.addEventListener('submit', handleSubmit);
document.addEventListener('click', handleClick);
document.addEventListener('change', event => {
  const select = event.target.closest('[data-action-status]');
  if (select) {
    API.patch(`/api/actions/${select.dataset.actionStatus}`, { status:select.value }).then(async()=>{await refreshCore();toast('Action status updated.','success');render();}).catch(err=>toast(err.message,'error'));
  }
});
document.addEventListener('click', event => {
  if (event.target.id === 'modalBackdrop') closeModal();
});
window.addEventListener('hashchange', async()=>{await refreshCore();await render();});

(async function boot(){
  try { await refreshCore(); }
  catch (err) { console.error(err); }
  await render();
  setInterval(async()=>{try{await refreshCore(); if(location.hash===''||location.hash==='#dashboard')render();}catch{/* ignore transient poll failures */}}, 45000);
})();

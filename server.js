const http = require('http');

const port = process.env.PORT || 3100;
const CONTRACT_VERSION = 'foreman.app.task.v1';
const receivedTasks = [];

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); }
    });
  });
}

function authorized(req) {
  const token = process.env.FOREMAN_APP_TOKEN;
  if (!token) return true;
  return req.headers.authorization === `Bearer ${token}`;
}

function normalizeEnvelope(body, headers = {}) {
  const task = body.task;
  if (!task || !task.id) return { ok: false, error: 'task.id is required' };

  const contract = body.contract || headers['x-foreman-contract'] || 'legacy.task.v0';
  const now = new Date().toISOString();
  return {
    ok: true,
    envelope: {
      contract,
      compatible: contract === CONTRACT_VERSION || contract === 'legacy.task.v0',
      eventId: body.eventId || `${task.id}-${Date.now()}`,
      eventType: body.eventType || 'task.created',
      source: body.source || 'hunter-foreman',
      createdAt: body.createdAt || now,
      receivedAt: now,
      receiverState: 'accepted',
      task,
      timeline: Array.isArray(body.timeline) ? body.timeline : [
        { at: now, actor: 'Receiver', action: 'legacy_task_received' },
      ],
    },
  };
}

function getStats() {
  return {
    totalReceived: receivedTasks.length,
    contract: CONTRACT_VERSION,
    latestTaskId: receivedTasks[0] ? receivedTasks[0].task.id : null,
    tokenRequired: Boolean(process.env.FOREMAN_APP_TOKEN),
  };
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hunter Foreman Demo Receiver</title>
  <style>
    :root { color-scheme: dark; --bg:#0b0d11; --panel:#151923; --line:#293140; --text:#f4f7fb; --muted:#a7b0c0; --accent:#8dffcf; --warn:#ffd166; --danger:#ff7a90; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:radial-gradient(circle at top,#1c2330 0,var(--bg) 48%); color:var(--text); }
    main { max-width: 1080px; margin:0 auto; padding:36px 18px 60px; }
    header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap; margin-bottom:18px; }
    h1 { font-size: clamp(34px, 6vw, 68px); letter-spacing:-.06em; line-height:.94; margin:8px 0; }
    p { color:var(--muted); line-height:1.55; }
    code { color:#dce8f7; }
    .card { border:1px solid var(--line); background:rgba(21,25,35,.92); border-radius:22px; padding:20px; margin:14px 0; box-shadow:0 20px 60px rgba(0,0,0,.28); }
    .pill { display:inline-flex; padding:6px 10px; border-radius:999px; background:#202839; color:var(--accent); font-weight:900; font-size:12px; margin:0 6px 6px 0; }
    .pill.warn { color:var(--warn); }
    .pill.danger { color:var(--danger); }
    .grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; }
    .stat { border:1px solid var(--line); background:#0d1118; border-radius:16px; padding:12px; }
    .timeline { display:grid; gap:8px; margin:12px 0; }
    .timeline div { border:1px solid var(--line); border-radius:14px; padding:10px; background:#0d1118; }
    pre { white-space:pre-wrap; background:#0f131b; border:1px solid var(--line); border-radius:14px; padding:12px; color:#dce8f7; overflow:auto; }
    .empty { border:1px dashed var(--line); border-radius:18px; padding:18px; background:#10151f; }
    @media (max-width: 850px) { .grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <span class="pill">External App Receiver</span>
        <h1>Connected Receiver App</h1>
        <p>This app proves that Hunter Foreman can dispatch structured work to an external application using a versioned contract.</p>
      </div>
      <section class="card">
        <strong>Receiver endpoint</strong>
        <p><code>POST /foreman/tasks</code></p>
        <p>Contract: <code>${CONTRACT_VERSION}</code></p>
      </section>
    </header>
    <section class="card">
      <h2>Live Receiver Status</h2>
      <div id="stats" class="grid"></div>
    </section>
    <section class="card"><h2>Received Tasks</h2><div id="tasks"><p>Loading receiver state...</p></div></section>
  </main>
  <script>
    function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
    async function load(){
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        renderStats(data.stats);
        renderTasks(data.tasks);
      } catch (error) {
        document.getElementById('tasks').innerHTML = '<div class="empty"><strong class="pill danger">Error</strong><p>Could not load receiver state. Refresh or restart the receiver app.</p></div>';
      }
    }
    function renderStats(stats){
      document.getElementById('stats').innerHTML =
        '<div class="stat"><span class="pill">Tasks</span><h3>' + escapeHtml(stats.totalReceived) + '</h3></div>' +
        '<div class="stat"><span class="pill">Contract</span><p><code>' + escapeHtml(stats.contract) + '</code></p></div>' +
        '<div class="stat"><span class="pill">Latest</span><p>' + escapeHtml(stats.latestTaskId || 'none') + '</p></div>' +
        '<div class="stat"><span class="pill ' + (stats.tokenRequired ? 'warn' : '') + '">Token</span><p>' + (stats.tokenRequired ? 'Required' : 'Not required for demo') + '</p></div>';
    }
    function renderTasks(tasks){
      const el = document.getElementById('tasks');
      if(!tasks.length){
        el.innerHTML = '<div class="empty">' +
          '<span class="pill warn">Waiting</span>' +
          '<h3>No tasks received yet</h3>' +
          '<p>Start the connected demo from <code>hunter-foreman</code>, submit a ROSE request, then this receiver will update automatically.</p>' +
          '<p>Expected command from the core repo: <code>docker compose -f docker-compose.connected.yml up --build</code></p>' +
        '</div>';
        return;
      }
      el.innerHTML = tasks.map(item => '<article class="card">' +
        '<span class="pill">' + escapeHtml(item.contract) + '</span><span class="pill">' + escapeHtml(item.eventType) + '</span><span class="pill">accepted</span>' +
        '<h3>' + escapeHtml(item.task.id) + '</h3>' +
        '<p><strong>' + escapeHtml(item.task.customerName || 'Unknown customer') + '</strong></p>' +
        '<p>' + escapeHtml(item.task.workflow && item.task.workflow.label ? item.task.workflow.label : 'Workflow not supplied') + '</p>' +
        '<p>Received: <strong>' + escapeHtml(item.receivedAt) + '</strong></p>' +
        '<h4>Timeline</h4>' +
        '<div class="timeline">' + item.timeline.map(step => '<div><strong>' + escapeHtml(step.actor) + '</strong>: ' + escapeHtml(step.action) + '<br><small>' + escapeHtml(step.at || '') + '</small></div>').join('') + '</div>' +
        '<details><summary>Raw contract payload</summary><pre>' + escapeHtml(JSON.stringify(item, null, 2)) + '</pre></details>' +
      '</article>').join('');
    }
    load();
    setInterval(load, 2500);
  </script>
</body>
</html>`;

http.createServer(async (req, res) => {
  if (req.url === '/health') return sendJson(res, 200, { ok: true, service: 'hunter-foreman-demo-receiver', contract: CONTRACT_VERSION, stats: getStats() });
  if (req.method === 'GET' && req.url === '/api/tasks') return sendJson(res, 200, { tasks: receivedTasks, stats: getStats() });
  if (req.method === 'POST' && req.url === '/foreman/tasks') {
    if (!authorized(req)) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
    try {
      const body = await readBody(req);
      const normalized = normalizeEnvelope(body, req.headers);
      if (!normalized.ok) return sendJson(res, 422, { ok: false, error: normalized.error });
      if (!normalized.envelope.compatible) return sendJson(res, 422, { ok: false, error: 'Unsupported contract version', contract: normalized.envelope.contract });
      receivedTasks.unshift(normalized.envelope);
      return sendJson(res, 201, { ok: true, received: normalized.envelope });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: 'Invalid request body' });
    }
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
}).listen(port, () => console.log(`Hunter Foreman demo receiver running on http://localhost:${port}`));

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
      task,
      timeline: Array.isArray(body.timeline) ? body.timeline : [
        { at: now, actor: 'Receiver', action: 'legacy_task_received' },
      ],
    },
  };
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hunter Foreman Demo Receiver</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#0b0d11; color:#f4f7fb; }
    main { max-width: 980px; margin:0 auto; padding:36px 18px; }
    .card { border:1px solid #293140; background:#151923; border-radius:22px; padding:20px; margin:14px 0; }
    .pill { display:inline-block; padding:6px 10px; border-radius:999px; background:#202839; color:#8dffcf; font-weight:800; font-size:12px; margin-right:6px; }
    .warn { color:#ffd166; }
    pre { white-space:pre-wrap; background:#0f131b; border:1px solid #293140; border-radius:14px; padding:12px; color:#dce8f7; }
    ol { color:#dce8f7; }
  </style>
</head>
<body>
  <main>
    <span class="pill">External App Receiver</span>
    <h1>Hunter Foreman Demo App</h1>
    <p>This app receives versioned tasks from the public Hunter Foreman app bridge at <code>POST /foreman/tasks</code>.</p>
    <section class="card"><h2>Received Tasks</h2><div id="tasks"></div></section>
  </main>
  <script>
    async function load(){
      const res = await fetch('/api/tasks');
      const data = await res.json();
      const el = document.getElementById('tasks');
      if(!data.tasks.length){ el.innerHTML = '<p>No tasks received yet. Point the main Hunter Foreman app bridge here.</p>'; return; }
      el.innerHTML = data.tasks.map(item => `<article class="card">
        <span class="pill">${item.contract}</span><span class="pill">${item.eventType}</span>
        <strong>${item.task.id}</strong>
        <p>${item.task.customerName}</p>
        <p>${item.task.workflow.label}</p>
        <p>Received: <strong>${item.receivedAt}</strong></p>
        <h3>Timeline</h3>
        <ol>${item.timeline.map(step => `<li>${step.actor}: ${step.action}</li>`).join('')}</ol>
        <pre>${JSON.stringify(item, null, 2)}</pre>
      </article>`).join('');
    }
    load();
    setInterval(load, 2500);
  </script>
</body>
</html>`;

http.createServer(async (req, res) => {
  if (req.url === '/health') return sendJson(res, 200, { ok: true, service: 'hunter-foreman-demo-receiver', contract: CONTRACT_VERSION });
  if (req.method === 'GET' && req.url === '/api/tasks') return sendJson(res, 200, { tasks: receivedTasks });
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

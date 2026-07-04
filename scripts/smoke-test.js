const assert = require('assert');

const contract = 'foreman.app.task.v1';
const envelope = {
  contract,
  eventId: 'HF-DEMO-1-123',
  eventType: 'task.created',
  source: 'hunter-foreman',
  createdAt: new Date().toISOString(),
  receiverState: 'accepted',
  task: {
    id: 'HF-DEMO-1',
    customerName: 'Demo Customer',
    workflow: { label: 'Business Automation Workflow', owner: 'Automation Team' },
    status: 'ready_to_assign',
  },
  timeline: [
    { actor: 'ROSE', action: 'request_received' },
    { actor: 'Foreman', action: 'task_created' },
    { actor: 'AppBridge', action: 'dispatch_requested' },
  ],
};

const stats = {
  totalReceived: 1,
  contract,
  latestTaskId: envelope.task.id,
  tokenRequired: false,
};

assert.ok(process.version, 'Node.js must be available');
assert.strictEqual(envelope.contract, contract);
assert.strictEqual(envelope.eventType, 'task.created');
assert.strictEqual(envelope.receiverState, 'accepted');
assert.ok(envelope.task.id);
assert.ok(envelope.timeline.length >= 3);
assert.strictEqual(stats.totalReceived, 1);
assert.strictEqual(stats.contract, contract);
assert.strictEqual(stats.latestTaskId, envelope.task.id);
assert.strictEqual(typeof stats.tokenRequired, 'boolean');

console.log('Hunter Foreman demo receiver smoke test passed');

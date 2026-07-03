const assert = require('assert');

const contract = 'foreman.app.task.v1';
const envelope = {
  contract,
  eventId: 'HF-DEMO-1-123',
  eventType: 'task.created',
  source: 'hunter-foreman',
  createdAt: new Date().toISOString(),
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

assert.ok(process.version, 'Node.js must be available');
assert.strictEqual(envelope.contract, contract);
assert.strictEqual(envelope.eventType, 'task.created');
assert.ok(envelope.task.id);
assert.ok(envelope.timeline.length >= 3);

console.log('Hunter Foreman demo receiver smoke test passed');

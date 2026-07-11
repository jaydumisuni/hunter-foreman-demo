# Hunter Foreman Demo Receiver

Public connected receiver for Hunter Foreman App Bridge tasks.

This repository receives tasks from the main [jaydumisuni/hunter-foreman](https://github.com/jaydumisuni/hunter-foreman) application when the bridge URL is configured.

## Repository Map

- Core application: [jaydumisuni/hunter-foreman](https://github.com/jaydumisuni/hunter-foreman)
- Demo receiver: [jaydumisuni/hunter-foreman-demo](https://github.com/jaydumisuni/hunter-foreman-demo)
- Judge-facing submission pack: [jaydumisuni/hunter-foreman-docs](https://github.com/jaydumisuni/hunter-foreman-docs)
- Supporting reviewer/proof layer: [jaydumisuni/Sergeant](https://github.com/jaydumisuni/Sergeant)

Review these repositories together as the complete Hunter Foreman hackathon project.

## Business Implementation Context

This receiver is not a throwaway webhook placeholder. It verifies the versioned receiving pattern intended for the wider THETECHGUY DIGITAL SOLUTIONS business architecture.

The public implementation proves that Hunter Foreman can move a request beyond intake and dashboard state into another application with a contract version, event type, task payload, acknowledgement, and visible timeline.

That receiver pattern is completed and verified. The remaining business work is rollout: applying approved adapters to the main operating environment and connecting existing private systems safely.

The broader THETECHGUY ecosystem already supports real Events, invitation, QR access, payment, referral, commission, and private WhatsApp workflows. Those production systems are intentionally not connected to this public receiver because they require private credentials, client records, transaction data, and internal infrastructure.

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3100
```

## Docker

```bash
docker compose up --build
```

## Connect From Main App

Run this receiver on port 3100, then start the main Hunter Foreman application with the receiver URL configured in the environment.

When a request is submitted in the main application, it sends the created task to:

```text
POST /foreman/tasks
```

## Bridge Contract

The receiver accepts the versioned Foreman bridge contract:

```text
foreman.app.task.v1
```

It displays the received task, event type, contract version, acknowledgement state, and ROSE → Foreman → App Bridge timeline.

## Role in the Submission

The main application proves intake, AI classification, task ownership, and dashboard state. This receiver proves that the workflow can leave the main application through a versioned contract and be accepted by a connected business application.

Completion in this public receiver means the receiving contract and acknowledgement pattern are implemented for the business architecture. It does not mean private production systems or data are exposed here.

The judge-facing public application is available at:

```text
https://hunter-foreman.thetechguyds.com
```

The operating business context is visible at:

```text
https://thetechguyds.com
https://events.thetechguyds.com
```

## Optional Token

A shared bridge token can be configured locally for demo protection. Do not commit real secrets.

## Public Safety

No secrets, client data, transaction records, private Hunter internals, or production credentials are required.
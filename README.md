# Hunter Foreman Demo Receiver

Public demo receiver for Hunter Foreman app bridge tasks.

This repository receives tasks from the main `jaydumisuni/hunter-foreman` app when the bridge URL is configured.

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

Run this receiver on port 3100, then start the main Hunter Foreman app with the receiver URL configured in the environment.

When a request is submitted in the main app, it sends the created task to:

```text
POST /foreman/tasks
```

## Optional Token

A shared bridge token can be configured locally for demo protection. Do not commit real secrets.

## Public Safety

No secrets, no client data, no private Hunter internals, and no production credentials are required.

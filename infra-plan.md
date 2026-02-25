# Infisical Infra — Design Document

## Overview

Infisical Infra is an infrastructure-as-code management platform built into Infisical. It enables users to write, edit, plan, and apply OpenTofu configurations directly from the Infisical dashboard — with AI-powered insights and native secrets integration.

Think Terraform Cloud, but embedded in Infisical and taken a step further: in-browser editing, real-time plan/apply streaming, managed state, and an AI agent that summarizes changes and provides infrastructure insights.

## Goals

- Manage OpenTofu state, variables, and workspaces within Infisical
- Provide an in-browser `.tf` file editor with syntax highlighting
- Execute `tofu plan` and `tofu apply` from the dashboard with real-time output streaming
- AI-powered plan summaries and infrastructure insights
- Native integration with Infisical secrets — inject secrets directly into OpenTofu runs

## Architecture

```
┌─────────────────────────────────────┐
│           Infisical Dashboard       │
│  ┌───────────┐  ┌────────────────┐  │
│  │  Monaco   │  │  Live Console  │  │
│  │  Editor   │  │  (WebSocket)   │  │
│  └───────────┘  └────────────────┘  │
│                  ┌────────────────┐  │
│                  │  AI Summary    │  │
│                  └────────────────┘  │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│           Node.js Backend            │
│                                      │
│  ┌──────────┐  ┌──────────────────┐  │
│  │ File API │  │ State Backend    │  │
│  │ (CRUD)   │  │ (HTTP endpoints) │  │
│  └──────────┘  └──────────────────┘  │
│                                      │
│  ┌──────────┐  ┌──────────────────┐  │
│  │ Runner   │  │ AI Agent         │  │
│  │ (spawn)  │  │ (Gemini API)     │  │
│  └──────────┘  └──────────────────┘  │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
┌──────────┐   ┌────────────┐
│ OpenTofu │   │  Database  │
│  Binary  │   │  (state,   │
│          │   │   files,   │
│          │   │   runs)    │
└──────────┘   └────────────┘
```

## Core Components

### 1. Workspace Management

A workspace is an isolated unit containing a set of `.tf` files, variables, state, and run history.

**Data model:**

| Field         | Type     | Description                          |
| ------------- | -------- | ------------------------------------ |
| `id`          | UUID     | Primary key                          |
| `name`        | string   | Display name                         |
| `projectId`   | UUID     | FK to Infisical project              |
| `description` | string   | Optional description                 |
| `variables`   | jsonb    | Workspace-level TF variables         |
| `createdAt`   | datetime | Creation timestamp                   |
| `updatedAt`   | datetime | Last modified timestamp              |

### 2. File Storage

Each workspace contains one or more `.tf` files stored in the database.

**Data model:**

| Field         | Type     | Description                          |
| ------------- | -------- | ------------------------------------ |
| `id`          | UUID     | Primary key                          |
| `workspaceId` | UUID     | FK to workspace                      |
| `path`        | string   | File path (e.g. `main.tf`)          |
| `content`     | text     | File contents                        |
| `updatedAt`   | datetime | Last modified timestamp              |

Files are written to a temporary directory on disk at run time before executing OpenTofu commands.

### 3. State Backend

Implements the OpenTofu HTTP backend protocol — three endpoints:

| Method   | Endpoint                  | Description         |
| -------- | ------------------------- | ------------------- |
| `GET`    | `/api/infra/state/:id`    | Retrieve state      |
| `POST`   | `/api/infra/state/:id`    | Update state        |
| `DELETE` | `/api/infra/state/:id`    | Delete state        |

State is stored as a JSON blob in the database, keyed by workspace ID. A state lock mechanism (via `LOCK` / `UNLOCK` endpoints) should be implemented to prevent concurrent applies.

### 4. Runner (Execution Engine)

The runner executes OpenTofu commands as child processes on the backend.

**Flow:**

1. User triggers a plan or apply from the dashboard
2. Backend writes workspace files to a temp directory
3. Injects `backend.tf` pointing to Infisical's HTTP state backend
4. Injects Infisical secrets as environment variables (`TF_VAR_*`)
5. Spawns `tofu plan -json` or `tofu apply -json -auto-approve`
6. Streams stdout/stderr to the client over WebSocket
7. On completion, stores the run result and triggers AI summary
8. Cleans up the temp directory

**Run data model:**

| Field         | Type     | Description                          |
| ------------- | -------- | ------------------------------------ |
| `id`          | UUID     | Primary key                          |
| `workspaceId` | UUID     | FK to workspace                      |
| `type`        | enum     | `plan` or `apply`                    |
| `status`      | enum     | `pending`, `running`, `success`, `failed` |
| `output`      | text     | Full stdout/stderr log               |
| `aiSummary`   | text     | AI-generated summary                 |
| `triggeredBy` | UUID     | FK to user                           |
| `createdAt`   | datetime | Timestamp                            |

### 5. AI Agent

After each plan or apply, the JSON output is sent to the Gemini API for summarization and analysis.

**Capabilities:**

- **Plan summary**: Human-readable breakdown of what will be created, modified, and destroyed
- **Risk assessment**: Flag potentially dangerous changes (e.g. security group modifications, resource deletions)
- **Cost hints**: Estimate cost implications based on resource types
- **Best practice suggestions**: Flag anti-patterns in `.tf` files (e.g. hardcoded secrets, missing tags)

**Prompt structure:**

```
System: You are an infrastructure analysis agent for Infisical Infra.
        Summarize OpenTofu plan output for a technical audience.
        Highlight risks, costs, and best practices.

User:   <plan JSON output>
```

### 6. Frontend

- **Monaco Editor**: VS Code's editor component, embedded for `.tf` file editing with HCL syntax highlighting
- **File tree sidebar**: Simple list of files in the workspace with create/rename/delete
- **Console panel**: Real-time WebSocket stream of plan/apply output
- **AI summary card**: Rendered markdown summary after each run
- **Action bar**: Plan / Apply buttons with status indicators

## Secrets Integration

The key differentiator from Terraform Cloud — Infisical secrets are natively injected into OpenTofu runs:

1. User links an Infisical project/environment to a workspace
2. At run time, secrets are fetched and injected as `TF_VAR_<name>` environment variables
3. No `.tfvars` files needed, no copy-pasting — secrets flow directly from Infisical into infrastructure

## API Endpoints

| Method   | Endpoint                              | Description                    |
| -------- | ------------------------------------- | ------------------------------ |
| `GET`    | `/api/infra/workspaces`               | List workspaces                |
| `POST`   | `/api/infra/workspaces`               | Create workspace               |
| `GET`    | `/api/infra/workspaces/:id`           | Get workspace details          |
| `DELETE` | `/api/infra/workspaces/:id`           | Delete workspace               |
| `GET`    | `/api/infra/workspaces/:id/files`     | List files                     |
| `POST`   | `/api/infra/workspaces/:id/files`     | Create/update file             |
| `DELETE` | `/api/infra/workspaces/:id/files/:fid`| Delete file                    |
| `POST`   | `/api/infra/workspaces/:id/plan`      | Trigger plan                   |
| `POST`   | `/api/infra/workspaces/:id/apply`     | Trigger apply                  |
| `GET`    | `/api/infra/workspaces/:id/runs`      | List run history               |
| `GET`    | `/api/infra/state/:id`                | HTTP state backend — get       |
| `POST`   | `/api/infra/state/:id`                | HTTP state backend — update    |
| `DELETE` | `/api/infra/state/:id`                | HTTP state backend — delete    |

## Tech Stack

| Component      | Technology                                |
| -------------- | ----------------------------------------- |
| Frontend       | React + Monaco Editor                     |
| Backend        | Node.js (TypeScript)                      |
| IaC Engine     | OpenTofu (subprocess via `child_process`) |
| Database       | PostgreSQL (existing Infisical DB)        |
| Real-time      | WebSocket                                 |
| AI             | Gemini API                                |

## Hackathon Scope

**In scope (MVP):**

- Workspace CRUD
- File editor with Monaco
- `tofu plan` and `tofu apply` via subprocess with WebSocket streaming
- HTTP state backend
- AI plan summary via Gemini
- Infisical secrets injection as env vars

**Out of scope (future):**

- Container-based isolation per run
- State locking
- Drift detection
- Pull request / GitOps integration
- Role-based access controls on workspaces
- Provider caching / custom provider registries
- Approval workflows for applies

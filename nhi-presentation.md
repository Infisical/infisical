---
marp: true
theme: default
paginate: true
backgroundColor: #0a0a0a
color: #e0e0e0
style: |
  section {
    font-family: 'Inter', 'SF Pro Display', -apple-system, sans-serif;
  }
  h1 {
    color: #ECF26D;
    font-size: 2.2em;
  }
  h2 {
    color: #e0e0e0;
    font-size: 1.6em;
  }
  strong {
    color: #ECF26D;
  }
  h2 strong {
    color: #ECF26D;
  }
  code {
    background: #1e293b;
    color: #f59e0b;
    padding: 2px 8px;
    border-radius: 4px;
  }
  table {
    font-size: 0.8em;
  }
  th {
    background: #1e293b;
    color: #60a5fa;
  }
  td {
    background: #111827;
  }
  blockquote {
    border-left: 4px solid #ECF26D;
    background: #111827;
    padding: 12px 20px;
    border-radius: 0 8px 8px 0;
  }
  ul li::marker {
    color: #ECF26D;
  }
---

<!-- _class: lead -->
<!-- _paginate: false -->

# Infisical NHI

### Discover, Assess & Remediate Non-Human Identities

<br>

**Saif** | Rio Hackathon Feb 2026 (Remote) 😢

---

# The Problem

## NHIs outnumber humans **10-50x**
## Scattered across **AWS, GitHub, GCP**
## No owners. No rotation. **No visibility.**
## Old admin credentials = **#1 breach vector**

---

# How It Happens

## Dev adds **admin access** to test something, forgets to remove it
## CI bot token with **full repo access** shared across 20 pipelines
## Employee leaves, their **PATs and service accounts** live on forever
## GitHub app installed org-wide for a **one-time demo**, never removed

---

# Core Features

## **Multi-cloud Discovery** -- AWS, GitHub, GCP
## **Risk Scoring** -- 0-100 across 10 factors
## **One-click Remediation** -- fix directly in the provider
## **Policy Engine** -- auto-remediate after every scan

---

# Supporting Features

## **Slack Notifications** -- scan results & policy alerts
## **Risk Acceptance** -- acknowledge with reason & expiry
## **Scheduled Scans** -- 6h, 12h, daily, weekly, manual
## **Full Audit Trail** -- every action tracked

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Demo

---

<!-- _class: lead -->
<!-- _paginate: false -->

# Thank You

### Questions?

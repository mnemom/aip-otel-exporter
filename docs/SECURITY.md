# Security Policy

**Version:** 0.1.0
**Date:** 2026-02-13
**Status:** Draft

## Scope

This document covers the security considerations for `@mnemom/aip-otel-exporter` (TypeScript/npm)
and `aip-otel-exporter` (Python/PyPI) — the OpenTelemetry exporter for AIP integrity checkpoints
and AAP verification results.

## Data Handling

### What Data Flows Through the Exporter

The exporter converts AIP/AAP protocol outputs into OpenTelemetry spans and metrics. Data includes:

- **Integrity verdicts** (clear, review_needed, boundary_violation)
- **Concerns** (category and severity)
- **Verification results** (pass/fail, violation type and severity)
- **Coherence scores** (compatibility assessment between agents)
- **Drift alerts** (behavioral pattern changes over time)
- **Agent/card/session identifiers**
- **Analysis metadata** (model name, duration, token counts)

### What the Exporter Does NOT Handle

- **Thinking blocks** — Raw thinking content is never passed to the exporter. Only the
  `thinking_block_hash` (SHA-256) is recorded as a span attribute.
- **User content** — No user messages or prompts flow through the exporter.
- **Free text** — Since TypeScript 0.14.0 / Python 0.6.0 the typed recorders export
  identifiers and operational data only. Concern and violation descriptions, evidence,
  reasoning summaries, policy violation reasons, reclassification reasons and drift
  recommendations are never read, because judge-written or copied text can quote or
  paraphrase customer content. A named field whose value is not a string, number or
  boolean is dropped rather than stringified. The generic `recordSpan` / `buildSpan`
  helpers export whatever attributes their caller names.
- **Credentials** — API keys and tokens are only used for OTLP transport headers, never recorded
  as span attributes.

### Data Flow

```
AIP/AAP Protocol Output
    → Exporter (extracts attributes, creates spans)
        → OTel SDK / OTLP endpoint (transport)
            → Observability Platform (storage)
```

The exporter is a pass-through layer. Data retention, access controls, and encryption at rest are
the responsibility of the downstream observability platform.

## Threat Model

### 1. Sensitive Data in Span Attributes

**Risk:** Free-text fields (concern descriptions, violation details, policy reasons, drift
recommendations) may quote or paraphrase customer content or alignment card content.

**Mitigation:**
- The typed recorders do not export free-text fields (TypeScript 0.14.0+, Python 0.6.0+),
  and tests assert this for every recorder on every export path
- Use OTel SDK's `SpanProcessor` pipeline to filter or redact attributes you add yourself
  through `recordSpan` / `buildSpan`
- Configure your observability platform's data retention and access controls appropriately
- The exporter only records structured metadata, not raw thinking blocks or user content

### 2. OTLP Endpoint Authentication (Workers Adapter)

**Risk:** The Cloudflare Workers adapter sends OTLP data via `fetch()` to a configured endpoint.
Misconfigured endpoints could leak telemetry data.

**Mitigation:**
- Always use HTTPS endpoints
- Configure the `authorization` header with a valid bearer token
- Use Cloudflare Workers secrets (not environment variables) for tokens
- The exporter validates that the endpoint URL is provided at construction time

### 3. Auto-Instrumentation Monkey-Patching

**Risk:** The auto-instrumentation layer monkey-patches `AIPClient.prototype.check()` and AAP
verification functions. Malicious code could intercept these patches.

**Mitigation:**
- Auto-instrumentation should be initialized early in the application lifecycle
- The wrapper never modifies return values — it only observes them
- All recording is wrapped in try-catch to prevent instrumentation from breaking the application
- Use the manual API instead of auto-instrumentation in security-sensitive contexts

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

**Email:** dev@mnemom.ai

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

**Do not** open a public GitHub issue for security vulnerabilities.

We will acknowledge receipt within 48 hours and provide a timeline for a fix within 7 days.

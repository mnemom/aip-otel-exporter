# Dashboard Templates

Pre-built dashboard templates for visualizing AIP integrity checks and AAP verification results exported via `@mnemom/aip-otel-exporter`.

## Available Dashboards

| File | Platform | Description |
|------|----------|-------------|
| `grafana-aip-overview.json` | Grafana | Fleet-wide overview: verdict distribution, check rate, integrity ratio, concerns, AAP pass rate |
| `grafana-aip-detail.json` | Grafana | Per-agent deep dive: integrity ratio timeline, concern breakdown, verdict history, top concerns |
| `datadog-aip-overview.json` | Datadog | Fleet-wide overview using Datadog widget types: sunburst, timeseries, toplist, query_value |

## Importing into Grafana

### Via the Grafana UI

1. Open your Grafana instance.
2. Navigate to **Dashboards > New > Import**.
3. Click **Upload dashboard JSON file** and select the desired `.json` file.
4. Select your Prometheus data source when prompted (the dashboards use a `DS_PROMETHEUS` input variable).
5. Click **Import**.

### Via the Grafana API

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-grafana-api-key>" \
  -d @grafana-aip-overview.json \
  https://<your-grafana-host>/api/dashboards/import
```

Wrap the dashboard JSON in the import envelope if your Grafana version requires it:

```bash
jq '{ dashboard: ., overwrite: true, inputs: [{ name: "DS_PROMETHEUS", type: "datasource", pluginId: "prometheus", value: "your-prometheus-uid" }] }' \
  grafana-aip-overview.json | \
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-grafana-api-key>" \
  -d @- \
  https://<your-grafana-host>/api/dashboards/import
```

## Importing into Datadog

### Via the Datadog API

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: <your-datadog-api-key>" \
  -H "DD-APPLICATION-KEY: <your-datadog-app-key>" \
  -d @datadog-aip-overview.json \
  https://api.datadoghq.com/api/v1/dashboard
```

For EU-region accounts, use `api.datadoghq.eu` instead of `api.datadoghq.com`.

## Metric Name Mapping

The `@mnemom/aip-otel-exporter` package emits metrics with dotted names (e.g., `aip.integrity_checks.total`). How these appear in your observability backend depends on the backend:

| Backend | Metric name format | Example |
|---------|-------------------|---------|
| **Prometheus** / **Grafana** | Dots replaced with underscores | `aip_integrity_checks_total` |
| **Datadog** | Dots preserved | `aip.integrity_checks.total` |
| **Langfuse** | Trace attributes only (no metrics) | `aip.integrity.verdict` span attribute |

The Grafana dashboards use underscore-separated names (`aip_integrity_checks_total`) to match Prometheus conventions. The Datadog dashboard uses dot-separated names (`aip.integrity_checks.total`) to match Datadog conventions.

## Metrics Reference

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aip.integrity_checks.total` | Counter | `verdict`, `agent_id` | Total AIP integrity checks |
| `aip.concerns.total` | Counter | `category`, `severity` | Total integrity concerns raised |
| `aip.analysis.duration_ms` | Histogram | | Analysis duration in milliseconds |
| `aip.window.integrity_ratio` | Histogram | | Sliding window integrity ratio (0-1) |
| `aip.drift_alerts.total` | Counter | `severity` | AIP drift alerts |
| `aap.verifications.total` | Counter | `verified` | Total AAP trace verifications |
| `aap.violations.total` | Counter | `type`, `severity` | Total AAP violations |
| `aap.verification.duration_ms` | Histogram | | AAP verification duration in milliseconds |
| `aap.coherence.score` | Histogram | | AAP coherence scores |

## Customization

These dashboards are starting points. Common modifications:

- **Add alerting rules**: Create Grafana alerts on integrity ratio dropping below a threshold, or Datadog monitors on violation spikes.
- **Filter by environment**: Add a `$environment` template variable and filter metrics by an `environment` label if you tag your OTel resources with deployment environment.
- **Add additional agents**: The Grafana detail dashboard uses a single `$agent_id` selector. Switch it to multi-select if you want to compare agents side by side.

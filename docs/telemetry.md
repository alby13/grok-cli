# Grok CLI Observability Guide

Telemetry provides data about Grok CLI's performance, health, and usage. By enabling it, you can monitor operations, debug issues, and optimize tool usage through traces, metrics, and structured logs.

Grok CLI's telemetry system is built on the **[OpenTelemetry] (OTEL)** standard, allowing you to send data to any compatible backend. Telemetry is **disabled by default**.

[OpenTelemetry]: https://opentelemetry.io/

## Enabling telemetry

You can enable telemetry in multiple ways. Configuration is primarily managed via the [`.grok/settings.json` file](./cli/configuration.md) and environment variables, but CLI flags can override these settings for a specific session.

### Order of precedence

The following lists the precedence for applying telemetry settings, with items listed higher having greater precedence:

1.  **CLI flags (for `grok` command):**

    - `--telemetry` / `--no-telemetry`: Overrides `telemetry.enabled`.
    - `--telemetry-target <local>`: Overrides `telemetry.target` (only 'local' is meaningfully supported for this community CLI).
    - `--telemetry-otlp-endpoint <URL>`: Overrides `telemetry.otlpEndpoint`.
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`: Overrides `telemetry.logPrompts`.

1.  **Environment variables:**

    - `OTEL_EXPORTER_OTLP_ENDPOINT`: Overrides `telemetry.otlpEndpoint`.

1.  **Workspace settings file (`.grok/settings.json`):** Values from the `telemetry` object in this project-specific file.

1.  **User settings file (`~/.grok/settings.json`):** Values from the `telemetry` object in this global user file.

1.  **Defaults:** applied if not set by any of the above.
    - `telemetry.enabled`: `false` (Telemetry is disabled by default)
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true` (Note: actual logging of prompts depends on `telemetry.enabled` being true)

**For the `npm run telemetry` script:**
This script helps set up a local OpenTelemetry collector.

### Example settings

The following code can be added to your workspace (`.grok/settings.json`) or user (`~/.grok/settings.json`) settings to enable telemetry and send the output to a local collector:

```json
{
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317"
  },
  "sandbox": false
}
```

## Running an OTEL Collector (Local Setup)

An OTEL Collector is a service that receives, processes, and exports telemetry data.
The CLI sends data using the OTLP/gRPC protocol.

Learn more about OTEL exporter standard configuration in [documentation][otel-config-docs].

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### Local Telemetry Setup Script

Use the `npm run telemetry` command to automate the process of setting up a local telemetry pipeline, including configuring the necessary settings in your `.grok/settings.json` file. The underlying script installs `otelcol-contrib` (the OpenTelemetry Collector) and `jaeger` (The Jaeger UI for viewing traces). To use it:

1.  **Run the command**:
    Execute the command from the root of the repository:

    ```bash
    npm run telemetry
    ```

    The script will:

    - Download Jaeger and OTEL if needed.
    - Start a local Jaeger instance.
    - Start an OTEL collector configured to receive data from Grok CLI.
    - Guide you to enable telemetry in your workspace settings if not already enabled.
    - On exit, disable telemetry settings it might have temporarily changed for the session.

1.  **View traces**:
    Open your web browser and navigate to **http://localhost:16686** to access the Jaeger UI. Here you can inspect detailed traces of Grok CLI operations.

1.  **Inspect logs and metrics**:
    The script redirects the OTEL collector output (which includes logs and metrics) to `~/.grok/tmp/<projectHash>/otel/collector.log`. The script will provide links to view and command to tail your telemetry data (traces, metrics, logs) locally.

1.  **Stop the services**:
    Press `Ctrl+C` in the terminal where the script is running to stop the OTEL Collector and Jaeger services.

<!-- Google Cloud Section Removed as it's not applicable for a homemade CLI by alby13 using Grok API directly.
### Google Cloud
...
-->

## Logs and metric reference

The following section describes the structure of logs and metrics generated for Grok CLI.

- A `sessionId` is included as a common attribute on all logs and metrics.

### Logs

Logs are timestamped records of specific events. The following events are logged for Grok CLI:

- `grok_cli.config`: This event occurs once at startup with the CLI's configuration.

  - **Attributes**:
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)

- `grok_cli.user_prompt`: This event occurs when a user submits a prompt.

  - **Attributes**:
    - `prompt_length`
    - `prompt` (this attribute is excluded if `log_prompts_enabled` is configured to be `false` or if overall telemetry is disabled)

- `grok_cli.tool_call`: This event occurs for each function call.

  - **Attributes**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", or "modify", if applicable)
    - `error` (if applicable)
    - `error_type` (if applicable)

- `grok_cli.api_request`: This event occurs when making a request to the Grok API.

  - **Attributes**:
    - `model`
    - `request_text` (if applicable, and if prompt logging is enabled)

- `grok_cli.api_error`: This event occurs if the API request fails.

  - **Attributes**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`

- `grok_cli.api_response`: This event occurs upon receiving a response from the Grok API.

  - **Attributes**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (optional)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (if applicable, and if prompt logging is enabled)

### Metrics

Metrics are numerical measurements of behavior over time. The following metrics are collected for Grok CLI:

- `grok_cli.session.count` (Counter, Int): Incremented once per CLI startup.

- `grok_cli.tool.call.count` (Counter, Int): Counts tool calls.

  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", or "modify", if applicable)

- `grok_cli.tool.call.latency` (Histogram, ms): Measures tool call latency.

  - **Attributes**:
    - `function_name`
    - `decision` (string: "accept", "reject", or "modify", if applicable)

- `grok_cli.api.request.count` (Counter, Int): Counts all API requests.

  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (if applicable)

- `grok_cli.api.request.latency` (Histogram, ms): Measures API request latency.

  - **Attributes**:
    - `model`

- `grok_cli.token.usage` (Counter, Int): Counts the number of tokens used.

  - **Attributes**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache", or "tool")

- `grok_cli.file.operation.count` (Counter, Int): Counts file operations.

  - **Attributes**:
    - `operation` (string: "create", "read", "update"): The type of file operation.
    - `lines` (Int, if applicable): Number of lines in the file.
    - `mimetype` (string, if applicable): Mimetype of the file.
    - `extension` (string, if applicable): File extension of the file.

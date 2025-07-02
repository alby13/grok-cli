# Grok CLI (Community Version by alby13): Terms of Service and Privacy Notice

This Grok CLI is an open-source, community-driven tool developed by alby13. It allows you to interact with xAI's Grok API directly from your command-line interface using your own Grok API key.

**Important Disclaimers:**

*   This is **not an official xAI product**. It is a third-party tool.
*   Your use of the Grok API through this CLI is subject to **xAI's Grok API Terms of Service** and **xAI's Privacy Policy**. You are responsible for understanding and complying with those terms.
    *   Grok API Terms of Service: [https://x.ai/api-terms](https://x.ai/api-terms) (or current URL provided by xAI)
    *   xAI Privacy Policy: [https://x.ai/privacy](https://x.ai/privacy) (or current URL provided by xAI)
*   The developer of this CLI (alby13) does not collect, store, or transmit your API keys, prompts, or Grok API responses. All API communication occurs directly between this CLI running on your machine and the Grok API endpoints.

## Software License

This Grok CLI software is typically provided under an open-source license (e.g., Apache 2.0, MIT). Please refer to the `LICENSE` file in the repository root for specific license details for this CLI tool itself.

## Data Handled by this CLI (Locally on Your Machine)

This CLI tool may store the following information locally on your machine:

*   **Configuration Data:** Settings you configure for the CLI (e.g., in `~/.grok/settings.json` or a project-specific `.grok/settings.json`), such as theme preferences, default model choices, tool configurations.
*   **Hierarchical Context (`GROK.md` files):** If you create `GROK.md` files, their content is read by the CLI and sent to the Grok API as part of your prompts to provide context.
*   **Shell History:** If you use the integrated shell mode (`!`), a history of commands may be stored locally in a project-specific directory (e.g., `~/.grok/tmp/<project_hash>/shell_history`).
*   **Checkpoints:** If checkpointing is enabled, file states and conversation history may be stored locally.
*   **API Key:** Your `GROK_API_KEY` is accessed from your environment variables by the CLI to make API calls. The CLI does not store it elsewhere by default. You are responsible for the secure management of your environment variables.

## Telemetry / Usage Statistics (for this CLI tool)

This community version of Grok CLI may include an optional telemetry feature using OpenTelemetry.

*   **Default State:** Telemetry is **disabled by default**.
*   **What might be collected (if you enable it):** If enabled, it may collect anonymized or pseudonymized usage statistics about the CLI's performance and feature usage to help the developer (alby13) improve the tool. This typically includes:
    *   Tool names called, success/failure status, execution duration.
    *   CLI session information (e.g., CLI version, OS type).
    *   Error reports (stack traces, error messages) if the Software encounters an issue.
*   **What is NOT collected by this CLI's telemetry by default:**
    *   Your `GROK_API_KEY`.
    *   The content of your prompts sent to the Grok API.
    *   The content of responses received from the Grok API.
    *   Content of your local files (unless explicitly part of an error report you choose to share).
*   **Opt-in/Opt-out:** You can control this feature via the `telemetry.enabled` setting in the CLI's configuration files.
*   **Endpoint:** If enabled, this data is intended to be sent to a local OpenTelemetry collector by default (`http://localhost:4317`) or a user-configured OTLP endpoint. **The previous Google-specific Clearcut telemetry has been removed.**

**Note on Grok API Data Usage:** For information on how xAI uses the data you send to the Grok API (prompts, etc.), please refer to xAI's official Grok API Terms of Service and Privacy Policy linked above.

## Frequently Asked Questions (FAQ)

### 1. Is my code, prompts, or API key sent to anyone other than xAI's Grok API?

No. This CLI tool is designed to send your prompts and API key directly to the Grok API. The developer (alby13) does not have access to this information. If you enable the CLI's local telemetry, it collects anonymized usage data about the CLI tool itself, not your prompt/response content or API key.

### 2. How is my `GROK_API_KEY` handled?

The CLI reads your `GROK_API_KEY` from your environment variables to authenticate with the Grok API. It is not stored by the CLI persistently outside of your environment configuration.

By using this Grok CLI, you acknowledge that you have read, understood, and agree to these terms and the data practices described. You also acknowledge your responsibility to review and adhere to xAI's terms and policies for the Grok API.

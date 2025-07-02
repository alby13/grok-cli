## Authentication Setup

The Grok CLI (a homemade CLI by alby13) requires you to authenticate with xAI's Grok API using an API key.

### Grok API Key

This is the primary and recommended method for using this CLI.

-   **Obtain your API key:**
    Generate an API key from the xAI Platform (e.g., [https://x.ai/api](https://x.ai/api) or the current official URL provided by xAI).

-   **Set the `GROK_API_KEY` environment variable:**
    Replace `YOUR_GROK_API_KEY` with the API key you obtained.

    -   **Using an `.env` file (Recommended):**
        Create a file named `.env` in your project's root directory, an ancestor directory, or in your user-level configuration directory (`~/.grok/.env`). Add the following line:
        ```
        GROK_API_KEY="YOUR_GROK_API_KEY"
        ```
        The CLI will automatically load variables from this file.

    -   **Setting directly in your shell:**
        For temporary use in your current shell session:
        ```bash
        export GROK_API_KEY="YOUR_GROK_API_KEY"
        ```
        To make it persistent across sessions, add this line to your shell's startup file (e.g., `~/.bashrc`, `~/.zshrc`, `~/.profile`) and then source the file (e.g., `source ~/.bashrc`).

-   **CLI Usage:**
    Once the `GROK_API_KEY` is set in your environment, the Grok CLI will use it to authenticate with the Grok API. If the CLI includes an authentication selection dialog (e.g., via the `/auth` command), ensure the API key method (often represented as `AuthType.USE_XAI` internally) is selected or defaulted.

### Important Security Note

Always keep your `GROK_API_KEY` secure. Do not share it publicly or commit it to version control systems. Using an `.env` file that is listed in your project's `.gitignore` is a good practice for managing API keys locally.

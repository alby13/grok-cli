NOTE: THIS IS A WORK IN PROGRESS, IT HAS NOT BEEN TESTED. THANK YOU.

# Grok CLI

This repository contains the Grok CLI, a command-line AI workflow tool that connects to your
tools, understands your code and accelerates your workflows.

With the Grok CLI you can:

- Query and edit large codebases in and beyond Grok's 1M token context window.
- Generate new apps from prompts using Grok's coding capabilities.
  tool, built in to Grok.

## Quickstart

1. **Prerequisites:** Ensure you have [Node.js version 18](https://nodejs.org/en/download) or higher installed.
2. **Run the CLI:** Execute the following command in your terminal:

   ```bash
   npx https://github.com/alby13/grok-cli
   ```

3. **Pick a color theme**
4. **Authenticate:** When prompted, sign in with your personal Google account. This will grant you up to 60 model requests per minute and 1,000 model requests per day using Grok.

You are now ready to use the Grok CLI!

### For advanced use or increased limits:

If you need to use a specific model or require a higher request capacity, you can use an API key:

1. Generate a key from [xAI](https://x.ai/api).
2. Set it as an environment variable in your terminal. Replace `YOUR_API_KEY` with your generated key.

   ```bash
   export GROK_API_KEY="YOUR_API_KEY"
   ```

For other authentication methods, see the [authentication](./docs/cli/authentication.md) guide.

## Examples

Once the CLI is running, you can start interacting with Grok from your shell.

You can start a project from a new directory:

```sh
cd new-project/
grok
> Write me a Grok Discord bot that answers questions using a FAQ.md file I will provide
```

Or work with an existing project:

```sh
git clone https://github.com/alby13/grok-cli
cd grok-cli
grok
> Give me a summary of all of the changes that went in yesterday
```

### Next steps

- Learn how to [contribute to or build from the source](./CONTRIBUTING.md).
- Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- If you encounter any issues, review the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, see the [full documentation](./docs/index.md).

### Troubleshooting

Head over to the [troubleshooting](docs/troubleshooting.md) guide if you're
having issues.

## Popular tasks

### Explore a new codebase

Start by `cd`ing into an existing or newly-cloned repository and running `grok`.

```text
> Describe the main pieces of this system's architecture.
```

```text
> What security mechanisms are in place?
```

### Work with your existing code

```text
> Implement a first draft for GitHub issue #123.
```

```text
> Help me migrate this codebase to the latest version of Java. Start with a plan.
```

### Automate your workflows

Automating workflows may be added.

### Interact with your system

```text
> Convert all the images in this directory to png, and rename them to use dates from the exif data.
```

```text
> Organise my PDF invoices by month of expenditure.
```

## Terms of Service and Privacy Notice

For details on the terms of service and privacy notice applicable to your use of Grok CLI, see the [Terms of Service and Privacy Notice](./docs/tos-privacy.md).

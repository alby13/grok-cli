# Web Search Tool (`web_search`)

This document describes the `web_search` tool.

## Description

Use `web_search` to perform a web search via the Grok API. The `web_search` tool returns a summary of web results with sources.

### Arguments

`web_search` takes one argument:

- `query` (string, required): The search query.

## How to use `web_search` with the Grok CLI

The `web_search` tool sends a query to the Grok API, which then performs a web search. `web_search` will return a generated response based on the search results, including citations and sources.

Usage:

```
web_search(query="Your query goes here.")
```

## `web_search` examples

Get information on a topic:

```
web_search(query="latest advancements in AI-powered code generation")
```

## Important notes

- **Response returned:** The `web_search` tool returns a processed summary, not a raw list of search results.
- **Citations:** The response includes citations to the sources used to generate the summary.

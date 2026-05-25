# Pi Golang Getting Started Package

A collection of packages, skills, and extensions for making Pi better with Go out of the box.

## Purpose

This repository collects Go-specific tools and integrations to enhance the Pi coding agent experience for Go development. In the end this will be published as a [pi package](https://pi.dev/packages).

## Features (WIP)

- **Spec-based Go development** - Reuse rpiv skills for structured Go projects
- **all rpiv tools** e.g. `web-tools` and `ask-user-question` ([source](https://github.com/juicesharp/rpiv-mono))
- **gopls MCP integration** - Out-of-the-box language server support for agents ([source](https://go.dev/gopls/features/mcp))
- **Golang-specialized system prompt** - Automatically swapped when Go extensions are used
- **Context analysis with Go** - Running tests and validation instead of relying solely on agent inference
- **pi package** - Delivery as api package

## Structure

- `extensions/` - Custom Pi extensions for Go development
- `packages/` - Shared utilities and helper functions
- `skills/` - Go-specific skill implementations

## Status

Work in progress. The goal is to provide a comprehensive Go development environment within Pi, leveraging existing rpiv skills and adding Go-specific capabilities.

## License

MIT (unless otherwise specified in subcomponents)
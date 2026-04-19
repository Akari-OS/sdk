# Contributing to AKARI Module SDK

Thank you for your interest in contributing! This guide covers everything you need to know.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Contribution Areas by Tier](#contribution-areas-by-tier)
- [Documentation Guidelines](#documentation-guidelines)

---

## Code of Conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md).
Please read it before participating.

---

## How to Contribute

### Small fixes (typos, broken links, doc improvements)

Open a Pull Request directly — no issue needed.

### New features or API changes

1. Open an Issue first to discuss the change
2. Wait for maintainer acknowledgment before writing code
3. Submit a PR referencing the issue

### Bug reports

Use the bug report issue template. Include:
- SDK version (`@akari-os/sdk` version from `package.json`)
- Node.js version
- Tier (Full or MCP-Declarative)
- Minimal reproduction steps

---

## Development Setup

### Prerequisites

- Node.js >= 18
- pnpm >= 9

### Install

```bash
git clone https://github.com/Akari-OS/sdk.git
cd sdk
pnpm install
```

### Build all packages

```bash
pnpm build
```

### Run tests

```bash
pnpm test
```

### Type check

```bash
pnpm typecheck
```

### Work on a specific package

```bash
cd packages/sdk
pnpm dev
```

---

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Build process, tooling, dependency updates |
| `perf` | Performance improvement |

### Scope (optional)

Use the package name: `sdk`, `module-cli`, `panel-schema`, `cert`, `docs`, `examples`.

### Examples

```
feat(sdk): add pool.search() pagination support
fix(module-cli): correct tsconfig path in generated template
docs: add MCP-Declarative cookbook recipe for REST API integration
chore(deps): update typescript to 5.8
```

### Breaking changes

Add `BREAKING CHANGE:` footer or `!` after the type:

```
feat(sdk)!: rename amp.record() to amp.write()

BREAKING CHANGE: amp.record() has been renamed to amp.write()
for consistency with the Memory API naming convention.
Migration: replace all amp.record() calls with amp.write().
```

---

## Pull Request Process

### Before opening a PR

- [ ] Run `pnpm build` — no build errors
- [ ] Run `pnpm test` — all tests pass
- [ ] Run `pnpm typecheck` — no type errors
- [ ] Update documentation if you changed public APIs
- [ ] Add or update tests for new behavior

### PR title

Follow the same Conventional Commits format as commit messages.

### PR description template

```markdown
## What does this PR do?

[1–3 bullet points describing the change]

## Why?

[Context or link to the issue]

## How to test

[Steps to manually verify the change]

## Checklist

- [ ] Tests added/updated
- [ ] Docs updated (if API change)
- [ ] No breaking changes (or BREAKING CHANGE noted)
```

### Review process

- A maintainer will review within 5 business days
- Address all review comments before merge
- Squash commits on merge (maintainer will do this)

---

## Issue Guidelines

### Bug report

Include:
1. **Description** — what happened vs. what you expected
2. **Reproduction** — minimal code that reproduces the issue
3. **Environment** — OS, Node.js version, `@akari-os/sdk` version
4. **Logs** — relevant error output

### Feature request

Include:
1. **Problem** — what problem does this solve?
2. **Proposed solution** — how would it work?
3. **Alternatives considered** — what else did you think about?
4. **Tier** — is this for Full, MCP-Declarative, or both?

---

## Contribution Areas by Tier

### MCP-Declarative Tier

Good entry points for new contributors:
- Add new `panel.schema.json` widget types
- Improve error messages in the schema validator
- Add Cookbook recipes for popular REST APIs
- Improve generated template quality in `module-cli`

### Full Tier

Requires deeper SDK knowledge:
- Extend Agent API (`defineAgent`, `invoke`, `spawn`)
- Improve Memory API (`pool.search` ranking, AMP query performance)
- Add new Inter-App handoff patterns

### Cross-cutting

Available to all contributors:
- Documentation improvements (English ↔ Japanese translation)
- Test coverage additions
- Example implementations in `examples/`
- Certification (Lint rules, Contract Test cases)

---

## Documentation Guidelines

### Language

- Technical docs: English is primary; Japanese translation is welcome
- Section headers: provide both `English / 日本語` when adding new sections
- Code comments: English only

### File naming

- `kebab-case.md` — English, lowercase, hyphen-separated
- No spaces, no Japanese characters in file names

### Docs structure

- **Guides** (`docs/guides/`) — narrative, step-by-step
- **API Reference** (`docs/api-reference/`) — exhaustive, structured
- **Cookbook** (`docs/cookbook/`) — short recipes solving specific problems
- **Examples** (`examples/`) — runnable code

### Code examples in docs

- Always include the `import` statement
- Always show TypeScript (not JavaScript)
- Keep examples minimal — one concept per snippet

---

## Questions?

Open a [Discussion](https://github.com/Akari-OS/sdk/discussions) for general questions.
For bugs and features, use [Issues](https://github.com/Akari-OS/sdk/issues).

# Pim

_Pim is to Pi what Vim is to Vi._

A Bun-native, opinionated extension pack for [Pi Agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent).

## Quick Start

Assumes [`pi`](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) and [`bun`](https://bun.com/docs/installation) are already installed globally.

```bash
# Install the Pim extension pack
pi install npm:@aaroncql/pim

# Install the `pim` launcher via Bun
bun install -g @aaroncql/pim

# Launch pim
pim
```

`pim` is a thin Bun launcher around `pi` so that Pim's Bun-specific tooling work. Other extensions and packages registered with Pi continue to work normally.

## Developing

Assuming you are in this repo:

```bash
# Link locally and launch pim
bun dev
```

Pim is registered as a project-local Pi package via `.pi/settings.json`. Pi auto-loads it when launched from within this repo. Outside this repo, `pim` is still on PATH but no Pim package is loaded.

- To reload Pim after edits, run the built-in `/reload` command
- To tear down, run `bun unlink` within this dir

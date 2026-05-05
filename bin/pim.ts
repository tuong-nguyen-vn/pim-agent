#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PI_PACKAGE = "@mariozechner/pi-coding-agent";

function findPiCli(): string {
  try {
    const pkgUrl = import.meta.resolve(`${PI_PACKAGE}/package.json`);
    return join(dirname(fileURLToPath(pkgUrl)), "dist/cli.js");
  } catch {
    throw new Error(
      `Pim could not locate ${PI_PACKAGE}.\n` +
        `Install it under Bun: bun install -g ${PI_PACKAGE}`
    );
  }
}

const piCli = findPiCli();
const child = spawn(process.execPath, [piCli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

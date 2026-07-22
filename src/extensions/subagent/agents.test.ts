import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalAgentDir = process.env["PI_CODING_AGENT_DIR"];
let root: string;
let userAgentsDir: string;
let projectDir: string;

async function writeAgent(
  dir: string,
  fileName: string,
  content: string
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), content, "utf-8");
}

describe("discoverAgents", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "pim-subagent-"));
    userAgentsDir = join(root, "user-agent-dir", "agents");
    projectDir = join(root, "project");
    process.env["PI_CODING_AGENT_DIR"] = join(root, "user-agent-dir");
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalAgentDir === undefined) {
      delete process.env["PI_CODING_AGENT_DIR"];
    } else {
      process.env["PI_CODING_AGENT_DIR"] = originalAgentDir;
    }
    await rm(root, { recursive: true, force: true });
  });

  test("loads user agents with parsed frontmatter", async () => {
    await writeAgent(
      userAgentsDir,
      "reviewer.md",
      [
        "---",
        "name: reviewer",
        "description: Reviews code for bugs",
        "tools: read, grep",
        "model: anthropic/claude-haiku-4-5",
        "---",
        "You are a meticulous code reviewer.",
      ].join("\n")
    );

    const { discoverAgents } = await import("./agents");
    const agents = await discoverAgents(projectDir);

    expect(agents).toEqual([
      {
        name: "reviewer",
        description: "Reviews code for bugs",
        tools: ["read", "grep"],
        model: "anthropic/claude-haiku-4-5",
        systemPrompt: "You are a meticulous code reviewer.",
        source: "user",
      },
    ]);
  });

  test("ignores files missing required frontmatter", async () => {
    await writeAgent(
      userAgentsDir,
      "broken.md",
      ["---", "description: missing a name", "---", "body"].join("\n")
    );

    const { discoverAgents } = await import("./agents");
    expect(await discoverAgents(projectDir)).toEqual([]);
  });

  test("project agents override user agents with the same name", async () => {
    await writeAgent(
      userAgentsDir,
      "helper.md",
      [
        "---",
        "name: helper",
        "description: user helper",
        "---",
        "user prompt",
      ].join("\n")
    );
    const nestedProjectDir = join(projectDir, "nested");
    await mkdir(join(projectDir, ".pi", "agents"), { recursive: true });
    await mkdir(nestedProjectDir, { recursive: true });
    await writeAgent(
      join(projectDir, ".pi", "agents"),
      "helper.md",
      [
        "---",
        "name: helper",
        "description: project helper",
        "---",
        "project prompt",
      ].join("\n")
    );

    const { discoverAgents } = await import("./agents");
    // Discovery walks up from a nested cwd to find the nearest .pi/agents.
    const agents = await discoverAgents(nestedProjectDir);

    expect(agents).toEqual([
      {
        name: "helper",
        description: "project helper",
        tools: undefined,
        model: undefined,
        systemPrompt: "project prompt",
        source: "project",
      },
    ]);
  });
});

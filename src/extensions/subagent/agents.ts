import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CONFIG_DIR_NAME,
  getAgentDir,
  parseFrontmatter,
} from "@earendil-works/pi-coding-agent";

export type AgentSource = "user" | "project";

export type AgentConfig = {
  readonly name: string;
  readonly description: string;
  readonly tools: readonly string[] | undefined;
  readonly systemPrompt: string;
  readonly source: AgentSource;
};

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// Walks up from cwd looking for the nearest .pi/agents dir, mirroring how
// pi discovers project-local AGENTS.md/.pi/extensions.
async function findProjectAgentsDir(cwd: string): Promise<string | undefined> {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, CONFIG_DIR_NAME, "agents");
    if (await isDirectory(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

async function loadAgentConfig(
  filePath: string,
  source: AgentSource
): Promise<AgentConfig | undefined> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }

  const { frontmatter, body } =
    parseFrontmatter<Record<string, string>>(content);
  if (!frontmatter.name || !frontmatter.description) {
    return undefined;
  }

  const tools = frontmatter.tools
    ?.split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    tools: tools && tools.length > 0 ? tools : undefined,
    systemPrompt: body,
    source,
  };
}

async function loadAgentsFromDir(
  dir: string,
  source: AgentSource
): Promise<AgentConfig[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const configs = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => loadAgentConfig(join(dir, entry), source))
  );
  return configs.filter((c): c is AgentConfig => c !== undefined);
}

// Discovers predefined agents from ~/.pi/agent/agents (user) and the
// nearest .pi/agents up from cwd (project); project agents win by name.
export async function discoverAgents(
  cwd: string
): Promise<readonly AgentConfig[]> {
  const projectDir = await findProjectAgentsDir(cwd);
  const [userAgents, projectAgents] = await Promise.all([
    loadAgentsFromDir(join(getAgentDir(), "agents"), "user"),
    projectDir ? loadAgentsFromDir(projectDir, "project") : [],
  ]);

  const byName = new Map<string, AgentConfig>();
  for (const agent of userAgents) {
    byName.set(agent.name, agent);
  }
  for (const agent of projectAgents) {
    byName.set(agent.name, agent);
  }
  return Array.from(byName.values());
}

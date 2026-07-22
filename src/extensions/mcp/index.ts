import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { withMcpRenderer } from "./render";

type McpAdapter = (pi: ExtensionAPI) => void;

export default async function (pi: ExtensionAPI): Promise<void> {
  const moduleName: string = "pi-mcp-adapter";
  const { default: mcpAdapter } = (await import(moduleName)) as {
    readonly default: McpAdapter;
  };
  mcpAdapter(withMcpRenderer(pi));
}

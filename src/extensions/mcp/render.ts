import type {
  ExtensionAPI,
  Theme,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import {
  Renderer,
  type StatefulToolCallTitleContext,
} from "../../shared/Renderer";

type McpProxyInput = {
  readonly tool?: string;
  readonly args?: string;
  readonly connect?: string;
  readonly describe?: string;
  readonly search?: string;
  readonly server?: string;
  readonly action?: string;
};

type McpRenderContext = StatefulToolCallTitleContext & {
  readonly args?: unknown;
};

function compactJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return JSON.stringify(value) ?? "";
}

function proxyTitle(input: McpProxyInput): string {
  if (input.tool) {
    return input.server
      ? `mcp__${input.server}__${input.tool}`
      : directTitle(input.tool);
  }
  if (input.connect) {
    return `mcp connect ${input.connect}`;
  }
  if (input.describe) {
    return `mcp describe ${input.describe}`;
  }
  if (input.search) {
    return `mcp search ${input.search}${input.server ? ` @ ${input.server}` : ""}`;
  }
  if (input.server) {
    return `mcp list ${input.server}`;
  }
  if (input.action) {
    return `mcp ${input.action}`;
  }
  return "mcp status";
}

function directTitle(name: string): string {
  if (name.startsWith("mcp__")) {
    return name;
  }
  const separator = name.indexOf("_");
  if (separator === -1) {
    return `mcp__${name}`;
  }
  return `mcp__${name.slice(0, separator)}__${name.slice(separator + 1)}`;
}

function isMcpTool(tool: ToolDefinition): boolean {
  return tool.name === "mcp" || tool.label.startsWith("MCP:");
}

export function decorateMcpTool(tool: ToolDefinition): ToolDefinition {
  if (!isMcpTool(tool)) {
    return tool;
  }

  const renderTitle = (
    args: unknown,
    theme: Theme,
    context: McpRenderContext
  ) => {
    const input = (args ?? {}) as Record<string, unknown> & McpProxyInput;
    const isProxy = tool.name === "mcp";
    const title = isProxy ? proxyTitle(input) : directTitle(tool.name);
    const callArgs = isProxy ? input.args : input;
    const suffix = callArgs ? ` ${compactJson(callArgs)}` : "";
    const markerColor = Renderer.markerColorFor(
      Boolean(context.isPartial),
      Boolean(context.isError)
    );

    return Renderer.renderStatefulToolCallTitle({
      label: title,
      title: theme.fg("muted", suffix),
      theme,
      context,
      markerGlyph: Renderer.markerGlyphFor(markerColor),
      separator: "",
      useSpinner: true,
    });
  };

  return {
    ...tool,
    renderShell: "self",
    renderCall(args, theme, context) {
      return renderTitle(args, theme, context);
    },
    renderResult(_result, _options, theme, context) {
      renderTitle(context.args, theme, context);
      return new Container();
    },
  };
}

export function withMcpRenderer(pi: ExtensionAPI): ExtensionAPI {
  const registerTool = pi.registerTool.bind(pi);
  const wrapped = Object.create(pi) as ExtensionAPI;
  wrapped.registerTool = ((tool: ToolDefinition) => {
    registerTool(decorateMcpTool(tool));
  }) as ExtensionAPI["registerTool"];
  return wrapped;
}

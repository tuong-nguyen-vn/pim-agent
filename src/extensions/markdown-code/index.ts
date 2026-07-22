import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";

const PATCH_STATE = Symbol.for("pim.markdown-code-renderer");

type CodeToken = {
  readonly type: string;
  readonly text?: string;
  readonly lang?: string;
};

type RenderToken = (
  this: unknown,
  token: CodeToken,
  width: number,
  nextTokenType?: string,
  styleContext?: unknown
) => string[];

type MarkdownRenderPrototype = {
  renderToken: RenderToken;
  [PATCH_STATE]?: true;
};

function getMarkdownTheme(instance: unknown): MarkdownTheme {
  // Markdown.theme is private in the published types; access via bracket to
  // keep the runtime patch typed without casting the whole prototype to never.
  return (instance as { theme: MarkdownTheme }).theme;
}

/**
 * Amp-style fenced code blocks: keep indent + syntax highlight, drop the
 * literal ```lang / ``` fence chrome that Pi's default Markdown renderer draws.
 */
export function renderAmpCodeBlock(
  theme: MarkdownTheme,
  token: { readonly text?: string; readonly lang?: string },
  nextTokenType?: string
): string[] {
  const indent = theme.codeBlockIndent ?? "  ";
  const source = token.text ?? "";
  const lines: string[] = [];

  if (theme.highlightCode) {
    for (const hlLine of theme.highlightCode(source, token.lang)) {
      lines.push(`${indent}${hlLine}`);
    }
  } else {
    for (const codeLine of source.split("\n")) {
      lines.push(`${indent}${theme.codeBlock(codeLine)}`);
    }
  }

  if (nextTokenType && nextTokenType !== "space") {
    lines.push("");
  }

  return lines;
}

export default function (pi: ExtensionAPI): void {
  const prototype = Markdown.prototype as unknown as MarkdownRenderPrototype;
  if (prototype[PATCH_STATE]) {
    return;
  }

  const originalRenderToken = prototype.renderToken;
  prototype[PATCH_STATE] = true;

  prototype.renderToken = function (
    token,
    width,
    nextTokenType,
    styleContext
  ): string[] {
    if (token.type === "code") {
      return renderAmpCodeBlock(getMarkdownTheme(this), token, nextTokenType);
    }
    return originalRenderToken.call(
      this,
      token,
      width,
      nextTokenType,
      styleContext
    );
  };

  // Keep the extension registered with Pi's lifecycle even though the patch is
  // applied at import/load time. session_start is a no-op marker so reloads are
  // idempotent via PATCH_STATE.
  pi.on("session_start", () => {});
}

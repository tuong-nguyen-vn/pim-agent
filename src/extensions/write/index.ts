import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type DiffRenderState, DiffView } from "../../shared/DiffView";
import { Paths } from "../../shared/Paths";
import { Renderer } from "../../shared/Renderer";
import { Tools } from "../../shared/Tools";
import { type WriteInput, writeSchema } from "./schema";
import { writeContent, type WriteOutcome } from "./write";

const ERROR_PREVIEW_LINES = 12;
const DIFF_PREVIEW_LINES = 20;

export default function (pi: ExtensionAPI): void {
  Tools.register(pi, {
    name: "write",
    label: "write",
    description:
      "Create or overwrite UTF-8 text files. " +
      "Use write only for new files or full rewrites.",
    parameters: writeSchema,
    renderShell: "self",
    executionMode: "sequential",
    constrainedSampling: { type: "json_schema", strict: "prefer" },
    async execute(_id, params, signal, _onUpdate, ctx) {
      const { path, content } = params as WriteInput;

      if (signal?.aborted) {
        throw new Error("Write aborted before execution.");
      }

      const absolutePath = Paths.resolve(path, ctx.cwd);
      const outcome = await writeContent(absolutePath, content);

      return {
        content: [{ type: "text", text: formatSummary(path, outcome) }],
        details: outcome,
      };
    },
    renderCall(args, theme, context) {
      const rawPath = typeof args?.path === "string" ? args.path : undefined;
      return DiffView.renderDiffCall({
        label: "Create",
        rawPath,
        theme,
        context: context as typeof context & { state: DiffRenderState },
        separator: " ",
        markerGlyph: Renderer.markerGlyphFor,
        link: true,
        clickableLink: true,
        padTitle: false,
      });
    },
    renderResult(result, options, theme, context) {
      return DiffView.renderDiffResult({
        label: "Create",
        result,
        options,
        theme,
        context: context as typeof context & { state: DiffRenderState },
        previewLines: ERROR_PREVIEW_LINES,
        diffPreviewLines: DIFF_PREVIEW_LINES,
        separator: " ",
        markerGlyph: Renderer.markerGlyphFor,
      });
    },
  });
}

function formatSummary(path: string, outcome: WriteOutcome): string {
  const verb = outcome.created ? "Created" : "Wrote";
  const eofNote =
    outcome.trailingNewlineChange === undefined
      ? ""
      : ` Trailing newline ${outcome.trailingNewlineChange}.`;

  if (
    outcome.diff === undefined &&
    !outcome.created &&
    outcome.diffSkipped === undefined
  ) {
    return `Wrote ${outcome.bytesWritten} bytes to ${path} (no content changes).${eofNote}`;
  }

  if (outcome.diffSkipped !== undefined) {
    return `${verb} ${outcome.bytesWritten} bytes at ${path} (diff omitted: file exceeds ${outcome.diffSkipped.thresholdBytes}-byte render cap).${eofNote}`;
  }

  return `${verb} ${outcome.bytesWritten} bytes at ${path}.${eofNote}`;
}

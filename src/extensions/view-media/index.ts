import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ModelResolver } from "../../shared/ModelResolver";
import { Paths } from "../../shared/Paths";
import { PimSettings } from "../../shared/PimSettings";
import {
  Renderer,
  type StatefulToolCallTitleContext,
} from "../../shared/Renderer";
import { Tools } from "../../shared/Tools";

const PREVIEW_LINES = 5;

const IMAGE_EXT: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

type ViewMediaInput = {
  readonly path: string;
  readonly question?: string;
};

type ViewMediaDetails = {
  readonly isError?: boolean;
  readonly mimeType?: string;
  readonly bytes?: number;
  readonly source?: "direct" | "vision-fallback";
  readonly visionModel?: string;
};

type ViewMediaRenderContext = StatefulToolCallTitleContext & {
  readonly args?: Partial<ViewMediaInput>;
  readonly cwd: string;
};

function mimeFromPath(p: string): string | undefined {
  const m = p.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ? IMAGE_EXT[m[1]] : undefined;
}

function modelSupportsImages(model: unknown): boolean {
  return (
    !!model &&
    typeof model === "object" &&
    Array.isArray((model as { input?: unknown[] }).input) &&
    (model as { input: unknown[] }).input.includes("image")
  );
}

function errResult(text: string): AgentToolResult<ViewMediaDetails> {
  return {
    content: [{ type: "text", text }],
    details: { isError: true },
  };
}

function renderTitle(
  args: Partial<ViewMediaInput> | undefined,
  theme: Theme,
  context: ViewMediaRenderContext
) {
  const rawPath = args?.path ?? "";
  const absPath = rawPath ? Paths.resolve(rawPath, context.cwd) : "";
  const basename = rawPath
    ? (Paths.toForwardSlashes(rawPath).split("/").pop() ?? rawPath)
    : "...";
  const title = absPath
    ? Renderer.renderFileLink(theme, basename, absPath)
    : "...";
  const markerColor = Renderer.markerColorFor(
    Boolean(context.isPartial),
    Boolean(context.isError)
  );
  return Renderer.renderStatefulToolCallTitle({
    label: "view_media",
    title,
    theme,
    context,
    markerGlyph: Renderer.markerGlyphFor(markerColor),
    separator: " ",
  });
}

async function describeWithVision(
  base: string,
  key: string,
  model: string,
  base64: string,
  mimeType: string,
  question: string,
  signal: AbortSignal | undefined
): Promise<{ description: string; model: string }> {
  const prompt =
    question?.trim() ||
    "Describe this image concisely: key objects, text (OCR), colors, layout. Be factual and specific.";

  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`vision fallback ${resp.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };
  const content = data?.choices?.[0]?.message?.content;
  const description = Array.isArray(content)
    ? content
        .map((c) => (typeof c === "string" ? c : (c?.text ?? "")))
        .filter(Boolean)
        .join("\n")
        .trim()
    : (typeof content === "string" ? content : "").trim();
  return { description, model };
}

export default function (pi: ExtensionAPI): void {
  Tools.register(pi, {
    name: "view_media",
    label: "view_media",
    description:
      "View an image file. Renders it inline in the terminal and returns a description. " +
      "Use this for screenshots, diagrams, photos, mockups, or any image the user references. " +
      "Works even when the current model cannot read images (a vision fallback model is used automatically).",
    promptSnippet: "View an image file",
    parameters: Type.Object({
      path: Type.String({
        description: "Path to the image file (relative or absolute)",
      }),
      question: Type.Optional(
        Type.String({
          description:
            "Optional question or focus for analysis (e.g. 'Read all text', 'Identify the error dialog'). " +
            "If omitted, a general description is produced.",
        })
      ),
    }),
    renderShell: "self",
    executionMode: "parallel",
    async execute(_id, params, signal, _onUpdate, ctx) {
      const args = params as ViewMediaInput;
      const absPath = Paths.resolve(args.path, ctx.cwd);

      const mimeType = mimeFromPath(absPath);
      if (!mimeType) {
        return errResult(
          `view_media: unsupported file type for "${args.path}". Supported: ${Object.keys(IMAGE_EXT).join(", ")}.`
        );
      }

      if (!(await Bun.file(absPath).exists())) {
        return errResult(`view_media: file not found: "${args.path}"`);
      }

      if (signal?.aborted) {
        throw new Error("view_media aborted before execution.");
      }

      const buffer = Buffer.from(await Bun.file(absPath).arrayBuffer());
      const base64 = buffer.toString("base64");
      const supportsImages = modelSupportsImages(ctx.model);

      const imageBlock = {
        type: "image" as const,
        data: base64,
        mimeType,
      };

      if (supportsImages) {
        const note = args.question?.trim()
          ? `Viewing image "${absPath}" (question: ${args.question.trim()}). The image is attached.`
          : `Viewing image "${absPath}". The image is attached.`;
        return {
          content: [{ type: "text" as const, text: note }, imageBlock],
          details: {
            mimeType,
            bytes: buffer.length,
            source: "direct" as const,
          } satisfies ViewMediaDetails,
        };
      }

      const model = await PimSettings.getViewMediaModel();
      const provider = await ModelResolver.resolveProvider(model);
      if (!provider) {
        const note = `Viewing image "${absPath}". The image is attached for display only.`;
        return {
          content: [
            {
              type: "text" as const,
              text: `${note}\n\nview_media: vision fallback model "${model}" not found in any provider in ~/.pi/agent/models.json. Set viewMedia.model in ~/.pim/settings.json to an available model.`,
            },
            imageBlock,
          ],
          details: { isError: true, mimeType, bytes: buffer.length },
        };
      }

      try {
        const { description, model: visionModel } = await describeWithVision(
          provider.baseUrl,
          provider.apiKey,
          model,
          base64,
          mimeType,
          args.question ?? "",
          signal
        );
        const header =
          `Viewing image "${absPath}" [${mimeType}, ${buffer.length} bytes].\n` +
          `Current model cannot read images; description via ${visionModel}:\n\n`;
        return {
          content: [
            { type: "text" as const, text: header + description },
            imageBlock,
          ],
          details: {
            mimeType,
            bytes: buffer.length,
            source: "vision-fallback" as const,
            visionModel,
          } satisfies ViewMediaDetails,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `view_media: read "${absPath}" but vision fallback failed: ${msg}. Image is attached for display only.`,
            },
            imageBlock,
          ],
          details: { isError: true, mimeType, bytes: buffer.length },
        };
      }
    },
    renderCall(args, theme, context) {
      return renderTitle(
        (args ?? {}) as Partial<ViewMediaInput>,
        theme,
        context as ViewMediaRenderContext
      );
    },
    renderResult(result, options, theme, context) {
      const ctx = context as ViewMediaRenderContext;
      renderTitle(ctx.args ?? {}, theme, ctx);

      const details = result.details as ViewMediaDetails | undefined;
      if (details?.isError) {
        return Renderer.renderBorderedResult({
          result,
          options,
          theme,
          context: ctx,
          previewLines: PREVIEW_LINES,
          prefix: { prefix: "   ", width: 3 },
        });
      }

      return Renderer.renderBorderedResult({
        result,
        options,
        theme,
        context: ctx,
        previewLines: PREVIEW_LINES,
        prefix: { prefix: "   ", width: 3 },
        showCollapsedSuccess: true,
      });
    },
  });
}

import type {
  AgentToolResult,
  Theme,
  ThemeColor,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Container,
  getCapabilities,
  hyperlink,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

export type RenderContext = {
  readonly lastComponent: Component | undefined;
  readonly isPartial: boolean;
  readonly isError: boolean;
};

export type StatefulToolCallTitleContext = RenderContext & {
  readonly state: unknown;
};

export type StatefulToolCallTitleState = {
  titleComponent?: Component;
};

export type MarkerStatus = "warning" | "error" | "success";

export type PrefixSpec = {
  readonly prefix: string;
  readonly width: number;
};

class ToolTitle implements Component {
  private text = "";
  private theme: Theme | undefined;
  private pad = true;

  public setText(text: string, theme: Theme, pad: boolean | undefined): void {
    this.text = text;
    this.theme = theme;
    this.pad = pad ?? this.pad;
  }

  public render(width: number): string[] {
    if (!this.text || this.text.trim() === "") {
      return [];
    }

    const theme = this.theme;
    const normalized = this.text.replace(/\t/g, "   ");
    const lines = wrapTextWithAnsi(normalized, Math.max(1, width));

    if (lines.length <= 1 || theme === undefined) {
      return lines.map((line) => this.padLine(line, width));
    }

    const inner = Math.max(1, width - Renderer.GAPPED_PREFIX.width);
    const out = [this.padLine(lines[0] ?? "", width)];

    for (const logical of lines.slice(1)) {
      for (const wrapped of wrapTextWithAnsi(logical, inner)) {
        out.push(
          this.padLine(
            theme.fg("toolOutput", Renderer.GAPPED_PREFIX.prefix) + wrapped,
            width
          )
        );
      }
    }

    return out;
  }

  public invalidate(): void {}

  private padLine(line: string, width: number): string {
    if (!this.pad) {
      return line;
    }
    return line + " ".repeat(Math.max(0, width - visibleWidth(line)));
  }
}

export class Renderer {
  public static readonly GAPPED_PREFIX: PrefixSpec = {
    prefix: " │ ",
    width: 3,
  };
  public static readonly TIGHT_PREFIX: PrefixSpec = {
    prefix: " │",
    width: 2,
  };

  public static markerColorFor(
    isPartial: boolean,
    isError: boolean
  ): MarkerStatus {
    if (isPartial) {
      return "warning";
    }
    if (isError) {
      return "error";
    }
    return "success";
  }

  public static markerGlyphFor(status: MarkerStatus): string {
    if (status === "success") {
      return "✓";
    }
    if (status === "error") {
      return "✗";
    }
    return "▪";
  }

  // Fixed truecolor match for Amp's file-link color (sampled: rgb(149,189,183)),
  // used regardless of the active pim theme so links look the same as Amp's.
  private static readonly FILE_LINK_FG = "\x1b[38;2;149;189;183m";
  private static readonly FG_RESET = "\x1b[39m";
  // Some terminals bleed the OSC 8 hover-underline decoration into trailing
  // plain text/padding after the link closes — a `\x1b[39m` fg-only reset
  // isn't enough to stop it, but a full SGR reset is. Only needed when we
  // actually emitted a hyperlink.
  private static readonly HARD_RESET = "\x1b[0m";
  private static readonly AUTO_LINK_BOUNDARY = "\u200b";

  /**
   * Style a file path as a link and wrap it in an OSC 8 hyperlink (to a
   * `file://` URI) when the terminal supports it, so it can be clicked to
   * open in the OS/editor's default handler for the scheme. Leave
   * underlining to the terminal's own hyperlink hover decoration — applying
   * our own SGR underline alongside OSC 8 makes some terminals extend the
   * hover underline to the end of the line.
   */
  public static renderFileLink(
    _theme: Theme,
    displayPath: string,
    absolutePath: string,
    clickable = true
  ): string {
    const styled = `${Renderer.FILE_LINK_FG}${displayPath}${Renderer.FG_RESET}`;
    if (!clickable) {
      return styled + Renderer.AUTO_LINK_BOUNDARY;
    }
    if (!getCapabilities().hyperlinks) {
      return styled;
    }
    return hyperlink(styled, `file://${absolutePath}`) + Renderer.HARD_RESET;
  }

  public static extractErrorText(
    result: {
      readonly content?: ReadonlyArray<{
        readonly type: string;
        readonly text?: string;
      }>;
    },
    fallback: string
  ): string {
    const text = (result.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();

    return text || fallback;
  }

  public static buildPreviewLines(
    body: string,
    maxLines: number
  ): { preview: string; overflow: number } {
    const lines = body.split("\n");
    if (lines.length <= maxLines) {
      return { preview: body, overflow: 0 };
    }
    return {
      preview: lines.slice(0, maxLines).join("\n"),
      overflow: lines.length - maxLines,
    };
  }

  public static renderToolCallTitle(args: {
    readonly label: string;
    readonly title: string;
    readonly theme: Theme;
    readonly context: RenderContext;
    readonly labelColor?: ThemeColor;
    readonly markerGlyph?: string;
    readonly separator?: string;
    readonly pad?: boolean;
  }): Component {
    const { label, title, theme, context, labelColor } = args;
    const markerColor = Renderer.markerColorFor(
      Boolean(context.isPartial),
      Boolean(context.isError)
    );
    const glyph = args.markerGlyph ?? "▪";
    const separator = args.separator ?? ": ";
    const component =
      context.lastComponent instanceof ToolTitle
        ? context.lastComponent
        : new ToolTitle();
    component.setText(
      theme.fg(markerColor, ` ${glyph}`) +
        " " +
        theme.fg(labelColor ?? "toolTitle", theme.bold(label)) +
        theme.fg("toolTitle", separator + title),
      theme,
      args.pad
    );
    return component;
  }

  public static renderStatefulToolCallTitle(args: {
    readonly label: string;
    readonly title: string;
    readonly theme: Theme;
    readonly context: StatefulToolCallTitleContext;
    readonly labelColor?: ThemeColor;
  }): Component {
    const state = args.context.state as StatefulToolCallTitleState;
    const component = Renderer.renderToolCallTitle({
      ...args,
      context: {
        ...args.context,
        lastComponent: state.titleComponent ?? args.context.lastComponent,
      },
    });
    state.titleComponent = component;
    return component;
  }

  public static makePrefixedBlock(args: {
    readonly text: string;
    readonly theme: Theme;
    readonly prefix: PrefixSpec;
    readonly lineColor?: ThemeColor;
  }): Component {
    const { text, theme, prefix, lineColor } = args;
    return {
      render(width: number): string[] {
        const inner = Math.max(1, width - prefix.width);
        const out: string[] = [];
        for (const logical of text.split("\n")) {
          for (const w of wrapTextWithAnsi(logical, inner)) {
            const body = lineColor ? theme.fg(lineColor, w) : w;
            out.push(theme.fg("toolOutput", prefix.prefix) + body);
          }
        }
        return out;
      },
      invalidate() {},
    };
  }

  public static renderBorderedResult(args: {
    readonly result: AgentToolResult<unknown>;
    readonly options: ToolRenderResultOptions;
    readonly theme: Theme;
    readonly context: RenderContext;
    readonly previewLines: number;
  }): Container {
    const { result, options, theme, context, previewLines } = args;
    const container =
      (context.lastComponent as Container | undefined) ?? new Container();
    container.clear();

    if (options.isPartial) {
      return container;
    }
    if (!context.isError && !options.expanded) {
      return container;
    }

    const first = result.content?.[0];
    const body = first && "text" in first ? (first.text ?? "") : "";
    if (!body) {
      return container;
    }

    const lineColor = context.isError ? "error" : "toolOutput";
    const block = (text: string): Component =>
      Renderer.makePrefixedBlock({
        text,
        theme,
        prefix: Renderer.GAPPED_PREFIX,
        lineColor,
      });

    if (options.expanded) {
      container.addChild(block(body));
    } else {
      const { preview, overflow } = Renderer.buildPreviewLines(
        body,
        previewLines
      );
      if (preview) {
        container.addChild(block(preview));
      }
      if (overflow > 0) {
        container.addChild(block(`… ${overflow} more lines`));
      }
    }

    container.invalidate();
    return container;
  }
}

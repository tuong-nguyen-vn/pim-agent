import {
  UserMessageComponent,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const PATCH_STATE = Symbol.for("pim.user-message-renderer");

type UserMessagePrototype = UserMessageComponent & {
  [PATCH_STATE]?: {
    theme: Theme;
  };
};

function isBlank(line: string): boolean {
  return Bun.stripANSI(line).trim().length === 0;
}

export function renderAmpUserMessage(
  lines: string[],
  width: number,
  theme: Theme
): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start] ?? "")) {
    start++;
  }
  while (end > start && isBlank(lines[end - 1] ?? "")) {
    end--;
  }
  if (start === end) {
    return [];
  }

  const rendered = lines.slice(start, end).map((line) => {
    const content = line.startsWith(" ") ? line.slice(1) : line;
    const prefix = theme.fg("success", "│") + " ";
    return truncateToWidth(prefix + theme.italic(content), width, "");
  });
  rendered[0] = OSC133_ZONE_START + rendered[0];
  rendered[rendered.length - 1] =
    OSC133_ZONE_END + OSC133_ZONE_FINAL + rendered[rendered.length - 1];
  return rendered;
}

export default function (pi: ExtensionAPI): void {
  const prototype = UserMessageComponent.prototype as UserMessagePrototype;
  const originalRender = prototype.render;

  pi.on("session_start", (_event, ctx) => {
    const existing = prototype[PATCH_STATE];
    if (existing) {
      existing.theme = ctx.ui.theme;
      return;
    }

    prototype[PATCH_STATE] = { theme: ctx.ui.theme };
    prototype.render = function (width: number): string[] {
      const lines = originalRender.call(this, width);
      const state = prototype[PATCH_STATE];
      return state ? renderAmpUserMessage(lines, width, state.theme) : lines;
    };
  });
}

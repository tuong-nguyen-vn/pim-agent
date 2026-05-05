import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  if (typeof Bun === "undefined") {
    throw new Error(
      "Pim requires the Bun runtime.\n" +
        "Install pi via: bun install -g @mariozechner/pi-coding-agent\n" +
        "Then run: bunx pi\n" +
        "Node-installed pi is not supported."
    );
  }

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("PIM - Pi IMproved", "info");
  });
}

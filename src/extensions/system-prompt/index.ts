import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt } from "./prompt";

export default function (pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event) => {
    const { cwd, contextFiles, skills, promptGuidelines, appendSystemPrompt } =
      event.systemPromptOptions;
    return {
      systemPrompt: buildSystemPrompt({
        cwd,
        contextFiles: contextFiles ?? [],
        skillsBlock:
          skills && skills.length > 0 ? formatSkillsForPrompt(skills) : "",
        toolGuidelines: promptGuidelines ?? [],
        appendSystemPrompt,
      }),
    };
  });
}

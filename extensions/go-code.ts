import { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ExtensionUIDialogOptions, SessionManager } from "@earendil-works/pi-coding-agent";
import { UserMessage } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";

import { findLatestFileFromDirectory, provideSkillLocationInformationToAgent, notify } from "./shared/shared.js"

enum PipelineCodingStages {
    "none" = 'none',
    "skill:implement" = 'skill:implement',
    "skill:validate" = 'skill:validate',
    "skill:plan" = 'skill:plan',
}

// ---------------------------------------------------------------------
// State tracking for the sequential pipeline
// ---------------------------------------------------------------------
const codeState = {
  phase: null as PipelineCodingStages | null,
  lastArtifact: null as string | null,
};

export default function (pi: ExtensionAPI) {

  const PIPELINE_SKILLS = [
    "skill:implement",
    "skill:validate",
  ];

  const handleGoCode = async (args: string, ctx: ExtensionCommandContext) => {

    if (!ctx.hasUI) {
      ctx.ui.notify("requires interactive mode", "error");
      return;
    }

    const sessionDir = ctx.sessionManager.getSessionDir()
    const session = SessionManager.continueRecent(sessionDir)

    // Validate required skills are available
    const missing = PIPELINE_SKILLS.filter((s) => !pi.getCommands().some((c) => c.name === s));
    if (missing.length > 0) {
      await notify(ctx, `Missing pipeline skills: ${missing.join(", ")}`, "error");
      await notify(ctx, `Please run: pi install npm:@juicesharp/rpiv-pi`, "info");
      return;
    }

    if (codeState.phase != PipelineCodingStages["skill:implement"]){
      await notify(ctx,`🗑️ Resetting current pupeline which was in state: ${codeState.phase}`, "info");
      codeState.phase = null;
      ctx.ui.setWorkingMessage(undefined)
      ctx.ui.setStatus("Phase",undefined)
    }else{
      await notify(ctx,`🎬 Starting go planning journey ${codeState.phase}`, "info");
    }

    try {
      codeState.phase = PipelineCodingStages["skill:implement"];
      codeState.lastArtifact = null;
      await implementPhase(args,ctx,session)
    } catch (error) {
      await notify(ctx,`Pipeline failed: ${String(error)}`, "error");
    }
  };

    const getFollowupPhase = async (phase: PipelineCodingStages) => {
      switch (phase) {
        case PipelineCodingStages["skill:implement"]:
          return PipelineCodingStages["skill:validate"]
          break;
        case PipelineCodingStages["skill:validate"]:
          return PipelineCodingStages["none"]
          break;
        case PipelineCodingStages["skill:plan"]:
          return PipelineCodingStages["skill:implement"]
          break;
        default:
          return PipelineCodingStages["none"]
          break;
      }
  }

  // ---------------------------------------------------------------------
  // Event listener: agent_end – check if the expected artifact exists and
  // progress to the next phase.
  // on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
  // ---------------------------------------------------------------------
  pi.on("agent_end", async (event, ctx: ExtensionContext) => {
    if ( !codeState.phase || codeState.phase == PipelineCodingStages.none) {
      return
    };

    const sessionDir = ctx.sessionManager.getSessionDir()
    const session = SessionManager.continueRecent(sessionDir)

    const opts: ExtensionUIDialogOptions = { timeout: 100000 }

    ctx.ui.setStatus("Phase",`${codeState.phase} -> ${getFollowupPhase(codeState.phase)}`)
    // FOR DEBUGGING:
    //ctx.ui.confirm(`Continue go:plan? ${state.phase} -> ${getFollowupPhase(state.phase)} `, "yes", opts)

    // Determine the artifact for the current phase and see if it now exists
    let artifactPath: string | null = null;
    switch (codeState.phase) {
      default:
        artifactPath = findLatestPlan();
        if (artifactPath && existsSync(artifactPath)) {
          codeState.phase = PipelineCodingStages["skill:implement"];
          codeState.lastArtifact = artifactPath;
          await notify(ctx, `✅ Plan artifact found: ${artifactPath}`, "info");
          await implementPhase(artifactPath, ctx, session);
        }
        break;
      case PipelineCodingStages["skill:implement"]:
        artifactPath = findLatestPlan();
        if (artifactPath && existsSync(artifactPath)) {
          codeState.phase = PipelineCodingStages["skill:validate"];
          codeState.lastArtifact = artifactPath;
          await notify(ctx, `✅ Plan artifact found: ${artifactPath}`, "info");
          await validatePhase(artifactPath, ctx, session);

          await notify(ctx, `🎉 Pipeline finished! Plan implemented: ${artifactPath}`, "info");
          ctx.ui.setWorkingMessage(undefined)
          ctx.ui.setStatus("Phase",undefined)
        }
        break;
    }
  });



  const implementPhase = async (args: string, ctx: ExtensionContext, session: SessionManager) => {
      // Step 1: Run implement
      const previousPhaseResultPath = findLatestPlan();
      await notify(ctx, `🔍 Phase 1: implement on ${previousPhaseResultPath}...`, "info");
      ctx.ui.setWorkingMessage(`...${codeState.phase}`)
      ctx.ui.setStatus("Phase",`${codeState.phase}`)
      provideSkillLocationInformationToAgent(session, "implement")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:implement ${previousPhaseResultPath}`, timestamp: Date.now()};
      codeState.phase = PipelineCodingStages["skill:implement"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for research artifact…", "info");
  }

  const validatePhase = async (args: string, ctx: ExtensionContext, session: SessionManager) => {
      // Step 2: Run validate
      const previousPhaseResultPath = findLatestPlan();
      await notify(ctx, `🔍 Phase 2: validate implementation with ${previousPhaseResultPath}...`, "info");
      ctx.ui.setWorkingMessage(`...${codeState.phase}`)
      ctx.ui.setStatus("Phase",`${codeState.phase}`)
      provideSkillLocationInformationToAgent(session, "validate")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:validate ${previousPhaseResultPath}`, timestamp: Date.now()};
      codeState.phase = PipelineCodingStages["skill:validate"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for research artifact…", "info");
  }

  // Helper functions to find latest artifacts from each stage
  const findLatestPlan = () => {
    return findLatestFileFromDirectory("./thoughts/shared/plans")
  };

  pi.registerCommand("go:code", {
    description: "Run full automated implementation (implement → validate)",
    handler: handleGoCode,
  });

}
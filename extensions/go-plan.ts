import { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ExtensionUIDialogOptions, SessionManager } from "@earendil-works/pi-coding-agent";
import { UserMessage } from "@earendil-works/pi-ai";
import {  existsSync } from "node:fs";
import { findLatestFileFromDirectory, provideSkillLocationInformationToAgent, notify } from "./shared/shared.js"

enum PipelinePlanningStages {
    "none" = 'none',
    "skill:discover" = 'skill:discover',
    "skill:research" = 'skill:research',
    "skill:design" = 'skill:design',
    "skill:plan" = 'skill:plan',
}

// ---------------------------------------------------------------------
// State tracking for the sequential pipeline
// ---------------------------------------------------------------------
const planState = {
  phase: null as PipelinePlanningStages | null,
  lastArtifact: null as string | null,
};

export default function (pi: ExtensionAPI) {

  const PIPELINE_SKILLS = [
    "skill:discover",
    "skill:research",
    "skill:design",
    "skill:plan",
  ];

  const sleep = async (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }



  const handleGoPlan = async (args: string, ctx: ExtensionCommandContext) => {

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

    if (planState.phase != PipelinePlanningStages["skill:design"]){
      await notify(ctx,`🗑️ Resetting current pupeline which was in state: ${planState.phase}`, "info");
      planState.phase = null;
      ctx.ui.setWorkingMessage(undefined)
      ctx.ui.setStatus("Phase",undefined)
    }else{
      await notify(ctx,`🎬 Starting go planning journey ${planState.phase}`, "info");
    }

    try {
      planState.phase = PipelinePlanningStages["skill:discover"];
      planState.lastArtifact = null;
      await discoverPhase(args,ctx,session)
    } catch (error) {
      await notify(ctx,`Pipeline failed: ${String(error)}`, "error");
    }
  };

    const getFollowupPhase = async (phase: PipelinePlanningStages) => {
      switch (phase) {
        case PipelinePlanningStages["skill:discover"]:
          return PipelinePlanningStages["skill:research"]
          break;
        case PipelinePlanningStages["skill:research"]:
          return PipelinePlanningStages["skill:design"]
          break;
        case PipelinePlanningStages["skill:design"]:
          return PipelinePlanningStages["skill:plan"]
          break;
        case PipelinePlanningStages["skill:plan"]:
          return PipelinePlanningStages["none"]
          break;
        default:
          return PipelinePlanningStages["none"]
          break;
      }
  }

    // ---------------------------------------------------------------------
  // Event listener: agent_end – check if the expected artifact exists and
  // progress to the next phase.
  // on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
  // ---------------------------------------------------------------------
  pi.on("agent_end", async (event, ctx: ExtensionContext) => {
    if ( !planState.phase || planState.phase == PipelinePlanningStages.none) {
      return
    };

    const sessionDir = ctx.sessionManager.getSessionDir()
    const session = SessionManager.continueRecent(sessionDir)

    const opts: ExtensionUIDialogOptions = { timeout: 100000 }

    ctx.ui.setStatus("Phase",`${planState.phase} -> ${getFollowupPhase(planState.phase)}`)
    // FOR DEBUGGING:
    //ctx.ui.confirm(`Continue go:plan? ${state.phase} -> ${getFollowupPhase(state.phase)} `, "yes", opts)

    // Determine the artifact for the current phase and see if it now exists
    let artifactPath: string | null = null;
    switch (planState.phase) {
      case PipelinePlanningStages["skill:discover"]:
        artifactPath = findLatestDiscovery();
        if (artifactPath && existsSync(artifactPath)) {
          planState.phase = PipelinePlanningStages["skill:research"];
          planState.lastArtifact = artifactPath;
          await notify(ctx, `✅ Discovery artifact found: ${artifactPath}`, "info");
          await researchPhase(artifactPath, ctx, session);
        }
        break;
      case PipelinePlanningStages["skill:research"]:
        artifactPath = findLatestResearch();
        if (artifactPath && existsSync(artifactPath)) {
          planState.phase = PipelinePlanningStages["skill:design"];
          planState.lastArtifact = artifactPath;
          await notify(ctx, `✅ Research artifact found: ${artifactPath}`, "info");
          await designPhase(artifactPath, ctx, session);
        }
        break;
      case PipelinePlanningStages["skill:design"]:
        artifactPath = findLatestDesign();
        if (artifactPath && existsSync(artifactPath)) {
          planState.phase = PipelinePlanningStages["skill:plan"];
          planState.lastArtifact = artifactPath;
          await notify(ctx, `✅ Design artifact found: ${artifactPath}`, "info");
          await planPhase( artifactPath, ctx, session);
        }
        break;
      case PipelinePlanningStages["skill:plan"]:
        artifactPath = findLatestPlan();
        if (artifactPath && existsSync(artifactPath)) {
          planState.phase = null;
          planState.lastArtifact = artifactPath;
          await notify(ctx, `🎉 Pipeline finished! Plan artifact: ${artifactPath}`, "info");
          ctx.ui.setWorkingMessage(undefined)
          ctx.ui.setStatus("Phase",undefined)
        }
        break;
    }
  });

  const discoverPhase = async (args: string, ctx: ExtensionCommandContext, session: SessionManager) => {
      // Step 1: Run discover
      await notify(ctx, "🚀 Phase 1: Discovery...", "info");
      ctx.ui.setWorkingMessage(`...${planState.phase}`)
      ctx.ui.setStatus("Phase",`${planState.phase}`)
      const featureDescription = args ;
      provideSkillLocationInformationToAgent(session, "discover")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:discover ${featureDescription}`, timestamp: Date.now()};
      planState.phase = PipelinePlanningStages["skill:discover"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for discovery artifact…", "info");
  }

  const researchPhase = async (args: string, ctx: ExtensionContext, session: SessionManager) => {
      // Step 2: Run research
      const previousPhaseResultPath = findLatestDiscovery();
      await notify(ctx, `🔍 Phase 2: Research on ${previousPhaseResultPath}...`, "info");
      ctx.ui.setWorkingMessage(`...${planState.phase}`)
      ctx.ui.setStatus("Phase",`${planState.phase}`)
      provideSkillLocationInformationToAgent(session, "research")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:research ${previousPhaseResultPath}`, timestamp: Date.now()};
      planState.phase = PipelinePlanningStages["skill:research"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for research artifact…", "info");
  }

  const designPhase = async (args: string, ctx: ExtensionContext, session: SessionManager) => {
      // Step 3: Run design
      const previousPhaseResultPath = findLatestResearch();
      await notify(ctx, `🖼️ Phase 3: Design wiith ${previousPhaseResultPath}...`, "info");
      ctx.ui.setWorkingMessage(`...${planState.phase}`)
      ctx.ui.setStatus("Phase",`${planState.phase}`)
      provideSkillLocationInformationToAgent(session, "design")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:design ${previousPhaseResultPath}`, timestamp: Date.now()};
      planState.phase = PipelinePlanningStages["skill:design"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for design artifact…", "info");
  }

  const planPhase = async (args: string, ctx: ExtensionContext, session: SessionManager) => {
      // Step 4: Run plan
      const previousPhaseResultPath = findLatestDesign();
      await notify(ctx, `✍️ Phase 4: Planning of design ${previousPhaseResultPath}...`, "info");
      ctx.ui.setWorkingMessage(`...${planState.phase}`)
      ctx.ui.setStatus("Phase",`${planState.phase}`)
      provideSkillLocationInformationToAgent(session, "plan")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:plan ${previousPhaseResultPath}`, timestamp: Date.now()};
      planState.phase = PipelinePlanningStages["skill:plan"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for plan artifact…", "info");
  }

  // Helper functions to find latest artifacts from each stage
  const findLatestDiscovery = () => {
    return findLatestFileFromDirectory("./thoughts/shared/discover")
  };

  const findLatestResearch = () => {
    return findLatestFileFromDirectory("./thoughts/shared/research")
  };

  const findLatestDesign = () => {
    return findLatestFileFromDirectory("./thoughts/shared/designs")
  };

  const findLatestPlan = () => {
    return findLatestFileFromDirectory("./thoughts/shared/plans")
  };

  pi.registerCommand("go:plan", {
    description: "Run full automated pipeline (Discover → Research → Design → Plan)",
    handler: handleGoPlan,
  });

  pi.registerCommand("go:spec", {
    description: "Alias for /go:plan",
    handler: handleGoPlan,
  });
}
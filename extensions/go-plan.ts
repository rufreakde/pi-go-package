import { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ExtensionUIDialogOptions, SessionManager } from "@earendil-works/pi-coding-agent";
import { UserMessage, AssistantMessage } from "@earendil-works/pi-ai";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

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
const state = {
  phase: null as PipelinePlanningStages | null,
  lastArtifact: null as string | null,
};

export default function (pi: ExtensionAPI) {
  const extensionIdentifier = "go-plan"

  const PIPELINE_SKILLS = [
    "skill:discover",
    "skill:research",
    "skill:design",
    "skill:plan",
  ];

  const sleep = async (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const notify = async (ctx: ExtensionCommandContext | ExtensionContext, message: string, type?: "info" | "warning" | "error" | undefined) => {
      ctx.ui.notify(message, type);
      await sleep(1000);
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

    if (state.phase != PipelinePlanningStages["skill:design"]){
      await notify(ctx,`🗑️ Resetting current pupeline which was in state: ${state.phase}`, "info");
      state.phase = null;
      ctx.ui.setWorkingMessage(undefined)
      ctx.ui.setStatus("Phase",undefined)
    }else{
      await notify(ctx,`🎬 Starting go planning journey ${state.phase}`, "info");
    }

    try {
      // TODO move to switch case instead and call it here and in on instead for retry mechanisms
      state.phase = PipelinePlanningStages["skill:discover"];
      state.lastArtifact = null;
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
    if ( !state.phase || state.phase == PipelinePlanningStages.none) {
      return
    };

    const sessionDir = ctx.sessionManager.getSessionDir()
    const session = SessionManager.continueRecent(sessionDir)

    const opts: ExtensionUIDialogOptions = { timeout: 100000 }

    ctx.ui.setStatus("Phase",`${state.phase} -> ${getFollowupPhase(state.phase)}`)
    // FOR DEBUGGING:
    //ctx.ui.confirm(`Continue go:plan? ${state.phase} -> ${getFollowupPhase(state.phase)} `, "yes", opts)

    // Determine the artifact for the current phase and see if it now exists
    let artifactPath: string | null = null;
    switch (state.phase) {
      case PipelinePlanningStages["skill:discover"]:
        artifactPath = findLatestDiscovery();
        if (artifactPath && existsSync(artifactPath)) {
          state.phase = PipelinePlanningStages["skill:research"];
          state.lastArtifact = artifactPath;
          await notify(ctx, `✅ Discovery artifact found: ${artifactPath}`, "info");
          await researchPhase(artifactPath, ctx, session);
        }
        break;
      case PipelinePlanningStages["skill:research"]:
        artifactPath = findLatestResearch();
        if (artifactPath && existsSync(artifactPath)) {
          state.phase = PipelinePlanningStages["skill:design"];
          state.lastArtifact = artifactPath;
          await notify(ctx, `✅ Research artifact found: ${artifactPath}`, "info");
          await designPhase(artifactPath, ctx, session);
        }
        break;
      case PipelinePlanningStages["skill:design"]:
        artifactPath = findLatestDesign();
        if (artifactPath && existsSync(artifactPath)) {
          state.phase = PipelinePlanningStages["skill:plan"];
          state.lastArtifact = artifactPath;
          await notify(ctx, `✅ Design artifact found: ${artifactPath}`, "info");
          await planPhase( artifactPath, ctx, session);
        }
        break;
      case PipelinePlanningStages["skill:plan"]:
        artifactPath = findLatestPlan();
        if (artifactPath && existsSync(artifactPath)) {
          state.phase = null;
          state.lastArtifact = artifactPath;
          await notify(ctx, `🎉 Pipeline finished! Plan artifact: ${artifactPath}`, "info");
          ctx.ui.setWorkingMessage(undefined)
          ctx.ui.setStatus("Phase",undefined)
        }
        break;
    }
  });

  const provideSkillLocationInformationToAgent = (session: SessionManager, skillName: string) : void =>{
      const infoLocationPrompt: UserMessage = {role: "user", content: `the skill '/skill:${skillName}' is your globally installed '${skillName}' pi skill.`, timestamp: Date.now()};
      session.appendMessage(infoLocationPrompt)
  }

  const discoverPhase = async (args: string, ctx: ExtensionCommandContext, session: SessionManager) => {
      // Step 1: Run discover
      await notify(ctx, "🚀 Phase 1: Discovery...", "info");
      ctx.ui.setWorkingMessage(`...${state.phase}`)
      ctx.ui.setStatus("Phase",`${state.phase}`)
      const featureDescription = args ;
      provideSkillLocationInformationToAgent(session, "discover")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:discover ${featureDescription}`, timestamp: Date.now()};
      state.phase = PipelinePlanningStages["skill:discover"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for discovery artifact…", "info");
  }

  const researchPhase = async (args: string, ctx: ExtensionContext, session: SessionManager) => {
      // Step 2: Run research
      const previousPhaseResultPath = findLatestDiscovery();
      await notify(ctx, `🔍 Phase 2: Research on ${previousPhaseResultPath}...`, "info");
      ctx.ui.setWorkingMessage(`...${state.phase}`)
      ctx.ui.setStatus("Phase",`${state.phase}`)
      provideSkillLocationInformationToAgent(session, "research")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:research ${previousPhaseResultPath}`, timestamp: Date.now()};
      state.phase = PipelinePlanningStages["skill:research"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for research artifact…", "info");
  }

  const designPhase = async (args: string, ctx: ExtensionContext, session: SessionManager) => {
      // Step 3: Run design
      const previousPhaseResultPath = findLatestResearch();
      await notify(ctx, `🖼️ Phase 3: Design wiith ${previousPhaseResultPath}...`, "info");
      ctx.ui.setWorkingMessage(`...${state.phase}`)
      ctx.ui.setStatus("Phase",`${state.phase}`)
      provideSkillLocationInformationToAgent(session, "design")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:design ${previousPhaseResultPath}`, timestamp: Date.now()};
      state.phase = PipelinePlanningStages["skill:design"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for design artifact…", "info");
  }

  const planPhase = async (args: string, ctx: ExtensionContext, session: SessionManager) => {
      // Step 4: Run plan
      const previousPhaseResultPath = findLatestDesign();
      await notify(ctx, `✍️ Phase 4: Planning of design ${previousPhaseResultPath}...`, "info");
      ctx.ui.setWorkingMessage(`...${state.phase}`)
      ctx.ui.setStatus("Phase",`${state.phase}`)
      provideSkillLocationInformationToAgent(session, "plan")

      const messagePrompt: UserMessage = {role: "user", content: `/skill:plan ${previousPhaseResultPath}`, timestamp: Date.now()};
      state.phase = PipelinePlanningStages["skill:plan"]

      pi.sendUserMessage(messagePrompt.content)
      await notify(ctx, "⏳ Waiting for plan artifact…", "info");
  }

   const findLatestFileFromDirectory = (directory: string): string => {
     // 1. Handle missing directory
     if (!existsSync(directory)) {
       return `Directory not found: ${directory}`;
     }

     // 2. Get files and their modification times
     const files = readdirSync(directory)
       .map((filename) => {
         const path = join(directory, filename);
         const stats = statSync(path);

         if (stats.isFile()) {
           return { path, mtime: stats.mtime.getTime() };
         }
         return null; // Return null for directories
       })
       .filter((file): file is { path: string; mtime: number } => file !== null); // Remove nulls

     // 3. Handle empty directory
     if (files.length === 0) {
       return `No file found in directory: ${directory}`;
     }

     // 4. Sort by newest first and return the path
     files.sort((a, b) => b.mtime - a.mtime);
     return files[0].path;
   };

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
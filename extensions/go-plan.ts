import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

var currentPipelineStage: PipelinePlanningStages = 0

enum PipelinePlanningStages {
    "skill:discover" = 0,
    "skill:research",
    "skill:design",
    "skill:plan",
}

export default function (pi: ExtensionAPI) {
  const PIPELINE_SKILLS = [
    "skill:discover",
    "skill:research",
    "skill:design",
    "skill:plan",
  ];

  // Helper to validate file existence
  const validatePlanFile = (filePath: string): Boolean => {
    const possibleLocations = [
      filePath
    ];
    
    for (const location of possibleLocations) {
      if (existsSync(location)) {
        return true;
      }
    }
    
    return false;
  };

  const handleGoPlan = async (args: string, ctx: ExtensionCommandContext) => {
    // Validate required skills are available
    const missing = PIPELINE_SKILLS.filter((s) => !pi.getCommands().some((c) => c.name === s));
    if (missing.length > 0) {
      ctx.ui.notify(`Missing pipeline skills: ${missing.join(", ")}`, "error");
      ctx.ui.notify(`Please run: pi install npm:@juicesharp/rpiv-pi`, "info");
      return;
    }

    // whenever the command /goplan is executed reset our currentPipelineStage
    if (currentPipelineStage != PipelinePlanningStages["skill:discover"]){
      ctx.ui.notify(`Resetting current pupeline which was in state: ${currentPipelineStage}`, "info");
      currentPipelineStage = PipelinePlanningStages["skill:discover"]
    }else{
      ctx.ui.notify(`Starting go planning journey ${currentPipelineStage}`, "info");
    }

    // const planFilePath = args.trim();

    // if (!validatePlanFile(planFilePath)) {
    //   ctx.ui.notify(`🚨 Plan file not found at specified path: ${planFilePath}`, "error");
    //   return;
    // }

    const allCommandsAvailable = pi.getCommands();

    // TODO
    // instead of this hard calling of our phases - we need to listen to agent_end events and then validate if the expected file exists
    //on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
    // then we can trigger the next phase which will go with "agend_start" and finally again "agent_end" 
    // intil we reach the final phase and a plan is created.

    ctx.ui.notify("🚀 Starting automated development pipeline...", "info");
    try {
      discoverPhase(args,ctx)

      researchPhase(args,ctx)

      designPhase(args,ctx)
      
      planPhase(args,ctx)

      const planpath = findLatestPlan();
      ctx.ui.notify(`🎉 Pipeline finished successfully! Plan can be found at ${planpath}`, "info");
    } catch (error) {
      ctx.ui.notify(`Pipeline failed: ${String(error)}`, "error");
    }
  };

  const discoverPhase = async (args: string, ctx: ExtensionCommandContext) => {
      // Step 1: Run discover
      ctx.ui.notify("🚀 Phase 1: Discovery...", "info");
      const featureDescription = args ; 
      await pi.exec(`pi`, ["--extension /skill:discover",`${featureDescription}`]);    
  }

  const researchPhase = async (args: string, ctx: ExtensionCommandContext) => {
      // Step 2: Run research
      const discoverResultPath = findLatestDiscovery();
      ctx.ui.notify(`🔍 Phase 2: Research on ${discoverResultPath}...`, "info");
      await pi.exec(`/skill:research`, [ `@${discoverResultPath}`]);
  }

  const designPhase = async (args: string, ctx: ExtensionCommandContext) => {
      // Step 3: Run design
      const researchResultPath = findLatestResearch();
      ctx.ui.notify(`🖼️ Phase 3: Design wiith ${researchResultPath}...`, "info");
      await pi.exec(`/skill:design`, [ `@${researchResultPath}`]);
  }

  const planPhase = async (args: string, ctx: ExtensionCommandContext) => {
      // Step 4: Run plan
      const designResultPath = findLatestDesign();
      ctx.ui.notify(`✍️ Phase 4: Planning of design ${designResultPath}...`, "info");
      await pi.exec(`/skill:plan`, [ `@${designResultPath}`]);
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
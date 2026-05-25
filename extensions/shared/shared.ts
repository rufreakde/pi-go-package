import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ExtensionCommandContext, ExtensionContext,  SessionManager } from "@earendil-works/pi-coding-agent";
import { UserMessage } from "@earendil-works/pi-ai";

export function findLatestFileFromDirectory(directory: string): string {
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
    return `No file found in directory: ${directory} seems the previous phase did not finish. It should have created a result file!`;
    }

    // 4. Sort by newest first and return the path
    files.sort((a, b) => b.mtime - a.mtime);
    return files[0].path;
};

export function provideSkillLocationInformationToAgent(session: SessionManager, skillName: string) : void {
    const infoLocationPrompt: UserMessage = {role: "user", content: `the skill '/skill:${skillName}' is your globally installed '${skillName}' pi skill.`, timestamp: Date.now()};
    session.appendMessage(infoLocationPrompt)
}

export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function notify(ctx: ExtensionCommandContext | ExtensionContext, message: string, type?: "info" | "warning" | "error" | undefined) : Promise<any> {
    ctx.ui.notify(message, type);
    return await sleep(1000);
}
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

export default function (pi: ExtensionAPI) {
  // Register the /go:init command
  pi.registerCommand("go:init", {
    description: "Initialize a Go project environment for pi-go harness",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Initializing pi-go Go environment...", "info");
      
      try {
        await initializeGoEnvironment(ctx);
        ctx.ui.notify("Successfully initialized pi go environment!", "info");
      } catch (error) {
        ctx.ui.notify(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    }
  });

  // Register a custom tool for the LLM to use during the feedback loop
  pi.registerTool({
    name: "go_init_status",
    label: "Go Init Status",
    description: "Check if pi-go Go environment is initialized",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const isInitialized = await checkGoEnvironmentInitialized();
      
      return {
        content: [{ 
          type: "text", 
          text: isInitialized 
            ? "pi-go Go environment is initialized" 
            : "pi-go Go environment is not initialized. Run /go:init to initialize." 
        }],
        details: {},
      };
    }
  });
}

async function initializeGoEnvironment(ctx: any) {
  // 1. Create .agents directory
  const agentsDir = ".agents";
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }

  // 2. Create .agents/go-rules.md if it doesn't exist
  const rulesPath = `${agentsDir}/go-rules.md`;
  if (!existsSync(rulesPath)) {
    const rulesContent = `# Go Rules
This file defines the canonical Go command table used by the pi-go harness.

| Command | Purpose | Example Usage |
|---------|---------|---------------|
| go fmt | Format code | go fmt ./... |
| go vet | Static analysis | go vet ./... |
| go build | Compile project | go build -v ./... |
| go test | Run tests | go test -v ./... |
| golangci-lint run | Lint code | golangci-lint run --format=table |

**Note:** Order is fixed: fmt → vet → build → test → lint.`;
    writeFileSync(rulesPath, rulesContent, "utf8");
  }

  // 3. Create .golangci.yml with strict defaults if it doesn't exist
  const linterPath = ".golangci.yml";
  if (!existsSync(linterPath)) {
    const linterContent = `run:
  timeout: 5m
linters:
  enable:
    - errcheck
    - staticcheck
    - unused
    - govet`;
    writeFileSync(linterPath, linterContent, "utf8");
  }

  // 4. Create .mcp.json with gopls transport config if it doesn't exist
  const mcpPath = ".mcp.json";
  if (!existsSync(mcpPath)) {
    const mcpContent = `{
  "mcpServers": {
    "gopls": {
      "command": "gopls",
      "args": ["mcp"]
    }
  }
}`;
    writeFileSync(mcpPath, mcpContent, "utf8");
  }

  // 5. Initialize Go module if go.mod doesn't exist
  if (!existsSync("go.mod")) {
    // Get current directory name for module
    const currentDir = resolve(".");
    const moduleName = basename(currentDir).toLowerCase();
    
    // Run go mod init
    try {
      execSync(`go mod init ${moduleName}`, { stdio: "pipe" });
    } catch (error) {
      throw new Error(`Failed to initialize Go module: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 6. Bootstrap project with main.go if no Go files exist
  const files = readdirSync(".");
  const hasGoFiles = files.some((f: string) => f.endsWith(".go"));
  
  if (!hasGoFiles) {
    const mainGoContent = `package main

import "fmt"

func main() {
	fmt.Println("Hello from pi go!")
}
`;
    writeFileSync("main.go", mainGoContent, "utf8");
    
    // Format the file
    try {
      execSync("go fmt ./...", { stdio: "pipe" });
    } catch (error) {
      // Non-fatal - continue even if fmt fails
    }
  }

  // 7. Always run go mod tidy
  try {
    execSync("go mod tidy", { stdio: "pipe" });
  } catch (error) {
    throw new Error(`go mod tidy failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkGoEnvironmentInitialized(): Promise<boolean> {
  const requiredFiles = [
    ".agents/go-rules.md",
    ".golangci.yml", 
    ".mcp.json",
    "go.mod"
  ];
  
  return requiredFiles.every((file: string) => existsSync(file));
}
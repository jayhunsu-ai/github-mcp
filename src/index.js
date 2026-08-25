import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as gh from "./github.js";

function buildServer() {
  const server = new McpServer({ name: "github-mcp", version: "1.0.0" });

  server.registerTool(
    "get_repo",
    {
      title: "Get repo info",
      description: "Fetch basic metadata for a repo (default branch, private flag, last push time).",
      inputSchema: { owner: z.string(), repo: z.string() },
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await gh.getRepo(args), null, 2) }] })
  );

  server.registerTool(
    "list_branches",
    {
      title: "List branches",
      description: "List branches in a repo.",
      inputSchema: { owner: z.string(), repo: z.string() },
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await gh.listBranches(args), null, 2) }] })
  );

  server.registerTool(
    "list_directory",
    {
      title: "List directory contents",
      description: "List files/folders at a path in a repo (defaults to repo root).",
      inputSchema: { owner: z.string(), repo: z.string(), path: z.string().optional(), ref: z.string().optional() },
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await gh.listDirectory(args), null, 2) }] })
  );

  server.registerTool(
    "get_file",
    {
      title: "Get file content",
      description: "Fetch a single file's decoded text content and its blob sha.",
      inputSchema: { owner: z.string(), repo: z.string(), path: z.string(), ref: z.string().optional() },
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await gh.getFile(args), null, 2) }] })
  );

  server.registerTool(
    "commit_files",
    {
      title: "Commit files",
      description:
        "Atomically create/update one or more files in a single commit on the given branch (Git Data API — blobs+tree+commit). Use for pushing a whole folder's worth of changes at once.",
      inputSchema: {
        owner: z.string(),
        repo: z.string(),
        branch: z.string(),
        message: z.string(),
        files: z.array(z.object({ path: z.string(), content: z.string() })),
      },
    },
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await gh.commitFiles(args), null, 2) }] })
  );

  return server;
}

const app = express();
app.use(express.json({ limit: "10mb" })); // generous body limit for multi-file commits

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "github-mcp" }));

app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`github-mcp listening on :${PORT}`));

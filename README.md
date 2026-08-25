# github-mcp

Minimal self-hosted MCP server exposing GitHub write access as tools, so a
connected Claude account can push code without a human doing `git push`
manually each time.

## Tools

| Tool | What it does |
|---|---|
| `get_repo` | Fetch default branch, private flag, last push time |
| `list_branches` | List branches |
| `list_directory` | List files/folders at a path |
| `get_file` | Fetch a file's decoded content + blob sha |
| `commit_files` | Atomically create/update one or more files in a single commit (Git Data API: blobs → tree → commit → ref update) — use this to push a whole folder at once |

## Security — read this before deploying

`GITHUB_TOKEN` must be set as an environment variable **directly in the
Manufact (or Render) dashboard's env var UI** — never pasted into a chat
with an AI assistant, never committed to this repo, never passed as a tool
argument. The server only ever reads it from `process.env`. If a token was
ever pasted into a chat, treat it as compromised and revoke it — generate a
fresh one and set it through the dashboard directly.

Recommended token scope: fine-grained PAT, `Contents: Read & write`,
restricted to the specific repo(s) this needs to touch. Avoid a
classic/all-repo token.

## Env vars

- `GITHUB_TOKEN` — fine-grained PAT, `Contents: Read & write`, scoped to the target repo(s)
- `PORT` — defaults to 8080

## Local run

```
npm install
npm start
curl localhost:8080/api/health
```

## Deploy

Push this repo to GitHub (first push has to be manual — bootstrapping
problem, this server can't push itself into existence), then:

```
Manufact:deploy  (point at the repo)
```

Manufact builds from the Dockerfile automatically. Set `GITHUB_TOKEN` in
Manufact's env var UI after deploying, then restart the service.

## Connecting a Claude account to this server

Add as a custom connector pointing at `https://<your-manufact-domain>/mcp`.

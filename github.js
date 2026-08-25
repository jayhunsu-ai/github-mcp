// Thin wrapper over the GitHub REST API. The token is read from an env var
// set directly on the hosting platform (Manufact/Render) — it is never
// passed through this server's MCP tool inputs, so it never round-trips
// through a chat transcript once deployed.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const API = "https://api.github.com";

if (!GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN env var is required.");
}

async function gh(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`GitHub API ${method} ${path} -> ${res.status}: ${json?.message || text}`);
  }
  return json;
}

export async function getFile({ owner, repo, path, ref }) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await gh(`/repos/${owner}/${repo}/contents/${path}${q}`);
  if (Array.isArray(data)) throw new Error(`${path} is a directory, not a file`);
  return {
    path: data.path,
    sha: data.sha,
    content: Buffer.from(data.content, "base64").toString("utf-8"),
  };
}

export async function listDirectory({ owner, repo, path = "", ref }) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await gh(`/repos/${owner}/${repo}/contents/${path}${q}`);
  const items = Array.isArray(data) ? data : [data];
  return items.map((i) => ({ name: i.name, path: i.path, type: i.type, sha: i.sha }));
}

// Atomic multi-file commit via the Git Data API:
// get ref -> get base commit/tree -> create blobs -> create new tree
// -> create commit -> update ref. Safe for pushing a whole folder at once.
export async function commitFiles({ owner, repo, branch, message, files }) {
  const refData = await gh(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  const baseCommitSha = refData.object.sha;
  const baseCommit = await gh(`/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;

  const blobs = await Promise.all(
    files.map(async (f) => {
      const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        body: { content: f.content, encoding: "utf-8" },
      });
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    })
  );

  const newTree = await gh(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: { base_tree: baseTreeSha, tree: blobs },
  });

  const newCommit = await gh(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: { message, tree: newTree.sha, parents: [baseCommitSha] },
  });

  await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: { sha: newCommit.sha },
  });

  return { commit_sha: newCommit.sha, files_changed: files.map((f) => f.path) };
}

export async function listBranches({ owner, repo }) {
  const data = await gh(`/repos/${owner}/${repo}/branches`);
  return data.map((b) => ({ name: b.name, sha: b.commit.sha }));
}

export async function getRepo({ owner, repo }) {
  const data = await gh(`/repos/${owner}/${repo}`);
  return {
    full_name: data.full_name,
    default_branch: data.default_branch,
    private: data.private,
    pushed_at: data.pushed_at,
  };
}

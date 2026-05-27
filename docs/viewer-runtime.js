export function escapeHtml(value) {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function viewerUsesDocsScopedAssets(viewerHref) {
  return new URL(viewerHref).pathname.includes("/docs/");
}

export function resolveRepoAssetHref(
  repoRelativePath,
  viewerHref = "https://webai-bridge.local/docs/viewer.html",
) {
  const viewerDir = new URL("./", viewerHref);
  const normalizedRepoPath = repoRelativePath.replace(/^\/+/, "");
  const assetPath =
    !viewerUsesDocsScopedAssets(viewerHref) && normalizedRepoPath.startsWith("docs/")
      ? normalizedRepoPath.slice("docs/".length)
      : normalizedRepoPath;
  const relativeAssetPath = viewerUsesDocsScopedAssets(viewerHref)
    ? `../${assetPath}`
    : `./${assetPath}`;

  return new URL(relativeAssetPath, viewerDir).toString();
}

export function resolveMarkdownHref(
  target,
  currentDocPath,
  viewerHref = "https://webai-bridge.local/docs/viewer.html",
) {
  if (!target || /^(https?:|mailto:|tel:)/i.test(target)) {
    return target;
  }

  if (target.startsWith("#")) {
    return target;
  }

  const docsScopedCurrent = currentDocPath.startsWith("docs/");
  const normalizedTarget =
    docsScopedCurrent && target.startsWith("./docs/")
      ? `./${target.slice("./docs/".length)}`
      : docsScopedCurrent && target.startsWith("docs/")
        ? target.slice("docs/".length)
        : target;

  const current = new URL(currentDocPath, "https://webai-bridge.local/");
  const resolved = new URL(normalizedTarget, current);
  const repoRelativePath = resolved.pathname.replace(/^\/+/, "");
  const viewerDocPath =
    !viewerUsesDocsScopedAssets(viewerHref) && repoRelativePath.startsWith("docs/")
      ? repoRelativePath.slice("docs/".length)
      : repoRelativePath;

  if (repoRelativePath.endsWith(".md")) {
    return `./viewer.html?doc=${encodeURIComponent(viewerDocPath)}${resolved.hash}`;
  }

  return `${resolveRepoAssetHref(repoRelativePath, viewerHref)}${resolved.hash}`;
}

export function resolveFrontDoorHref(
  viewerHref = "https://webai-bridge.local/docs/viewer.html",
) {
  if (viewerUsesDocsScopedAssets(viewerHref)) {
    return new URL("./index.html", viewerHref).toString();
  }

  return new URL("./", viewerHref).toString();
}

function formatDocTitle(docPath) {
  return docPath
    .replace(/\.md$/, "")
    .split("/")
    .pop()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDocMetaLabel(docPath) {
  const title = formatDocTitle(docPath);
  switch (docPath) {
    case "README.md":
    case "docs/README.md":
      return "Public Docs";
    case "docs/media/README.md":
      return "Media Shelf";
    case "docs/public-proof-pack.md":
      return "Proof pack";
    case "docs/public-distribution-ledger.md":
      return "Distribution ledger";
    default:
      return title || docPath;
  }
}

export function renderInline(
  source,
  currentDocPath,
  viewerHref = "https://webai-bridge.local/docs/viewer.html",
) {
  return escapeHtml(source)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeHtml(resolveMarkdownHref(href, currentDocPath, viewerHref) ?? href)}">${label}</a>`;
    });
}

function matchListLine(value) {
  const bulletMatch = value.match(/^(\s*)([-*])\s+(.*)$/);
  if (bulletMatch) {
    return {
      indent: bulletMatch[1].length,
      tag: "ul",
      content: bulletMatch[3],
    };
  }

  const orderedMatch = value.match(/^(\s*)(\d+\.)\s+(.*)$/);
  if (orderedMatch) {
    return {
      indent: orderedMatch[1].length,
      tag: "ol",
      content: orderedMatch[3],
    };
  }

  return null;
}

function parseList(lines, startIndex, baseIndent, tag, currentDocPath, viewerHref) {
  let listHtml = `<${tag}>`;
  let cursor = startIndex;

  while (cursor < lines.length) {
    const current = matchListLine(lines[cursor]);
    if (!current || current.indent < baseIndent || current.tag !== tag || current.indent > baseIndent) {
      break;
    }

    listHtml += `<li>${renderInline(current.content, currentDocPath, viewerHref)}`;
    cursor += 1;

    while (cursor < lines.length) {
      const nested = matchListLine(lines[cursor]);
      if (!nested || nested.indent <= baseIndent) {
        break;
      }
      const parsedNested = parseList(lines, cursor, nested.indent, nested.tag, currentDocPath, viewerHref);
      listHtml += parsedNested.html;
      cursor = parsedNested.index;
    }

    listHtml += "</li>";
  }

  listHtml += `</${tag}>`;
  return { html: listHtml, index: cursor };
}

export function renderMarkdown(
  markdown,
  currentDocPath,
  viewerHref = "https://webai-bridge.local/docs/viewer.html",
) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let index = 0;
  let inCode = false;
  let codeFence = "";

  function flushParagraph(buffer) {
    if (!buffer.length) return;
    html.push(`<p>${renderInline(buffer.join(" "), currentDocPath, viewerHref)}</p>`);
    buffer.length = 0;
  }

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeFence = "";
      } else {
        html.push(`<pre><code>${escapeHtml(codeFence.replace(/\n$/, ""))}</code></pre>`);
        inCode = false;
      }
      index += 1;
      continue;
    }

    if (inCode) {
      codeFence += `${line}\n`;
      index += 1;
      continue;
    }

    if (!line.trim()) {
      html.push("");
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2], currentDocPath, viewerHref)}</h${level}>`);
      index += 1;
      continue;
    }

    const listLine = matchListLine(line);
    if (listLine) {
      const parsedList = parseList(lines, index, listLine.indent, listLine.tag, currentDocPath, viewerHref);
      html.push(parsedList.html);
      index = parsedList.index;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(
        `<blockquote>${items
          .map((item) => `<p>${renderInline(item, currentDocPath, viewerHref)}</p>`)
          .join("")}</blockquote>`,
      );
      continue;
    }

    if (line.trim() === "---") {
      html.push("<hr />");
      index += 1;
      continue;
    }

    if (line.includes("|")) {
      const lookahead = lines[index + 1] ?? "";
      if (/^\s*\|?[-:\s|]+\|?\s*$/.test(lookahead)) {
        const headers = line.split("|").map((part) => part.trim()).filter(Boolean);
        index += 2;
        const rows = [];
        while (index < lines.length && lines[index].includes("|")) {
          const cols = lines[index].split("|").map((part) => part.trim()).filter(Boolean);
          if (!cols.length) break;
          rows.push(cols);
          index += 1;
        }
        html.push(
          `<table><thead><tr>${headers
            .map((cell) => `<th>${renderInline(cell, currentDocPath, viewerHref)}</th>`)
            .join("")}</tr></thead><tbody>${rows
            .map(
              (row) =>
                `<tr>${row
                  .map((cell) => `<td>${renderInline(cell, currentDocPath, viewerHref)}</td>`)
                  .join("")}</tr>`,
            )
            .join("")}</tbody></table>`,
        );
        continue;
      }
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index];
      if (
        next.startsWith("#") ||
        next.startsWith("```") ||
        /^\s*[-*]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next) ||
        /^\s*>\s?/.test(next) ||
        next.trim() === "---"
      ) {
        break;
      }
      paragraph.push(next.trim());
      index += 1;
    }
    flushParagraph(paragraph);
  }

  return html.filter(Boolean).join("\n");
}

export function resolveDocPath(
  search,
  locationHref = "https://webai-bridge.local/docs/viewer.html",
) {
  const params = new URLSearchParams(search);
  const raw = params.get("doc") ?? "README.md";
  if (/^(https?:|mailto:|tel:)/i.test(raw)) {
    return null;
  }

  const repoRootLike =
    raw.startsWith("/") ||
    raw.startsWith("docs/") ||
    raw.startsWith("examples/") ||
    raw.startsWith("starter-packs/") ||
    raw.startsWith(".agents/");
  const resolved = repoRootLike
    ? new URL(raw.replace(/^\/+/, ""), "https://webai-bridge.local/")
    : new URL(raw, new URL(locationHref).origin + "/docs/");
  const repoRelativePath = resolved.pathname.replace(/^\/+/, "");

  if (!repoRelativePath.endsWith(".md")) {
    return null;
  }

  return repoRelativePath;
}

export async function mountViewer({
  document,
  locationHref,
  search,
  fetchImpl,
}) {
  const docPath = resolveDocPath(search, locationHref);
  const content = document.getElementById("viewer-content");
  const title = document.getElementById("viewer-title");
  const subtitle = document.getElementById("viewer-subtitle");
  const rawLink = document.getElementById("raw-link");
  const frontDoorLink = document.getElementById("frontdoor-link");
  const docPathNode = document.getElementById("doc-path");

  if (!docPath) {
    content.classList.add("error");
    content.innerHTML = "<p>Invalid docs route.</p>";
    return;
  }

  if (frontDoorLink) {
    frontDoorLink.href = resolveFrontDoorHref(locationHref);
  }
  rawLink.href = resolveRepoAssetHref(docPath, locationHref);
  if (docPathNode) {
    docPathNode.textContent = formatDocMetaLabel(docPath);
  }
  title.textContent = formatDocTitle(docPath);
  subtitle.textContent =
    "Reader view for supporting public docs and proof pages. This is a deeper public shelf, not the front door.";

  try {
    const response = await fetchImpl(resolveRepoAssetHref(docPath, locationHref));
    if (!response.ok) {
      throw new Error(`Failed to load ${docPath} (${response.status})`);
    }
    const markdown = await response.text();
    content.innerHTML = renderMarkdown(markdown, docPath, locationHref);
    const firstHeading = content.querySelector("h1, h2");
    if (firstHeading) {
      title.textContent = firstHeading.textContent ?? title.textContent;
    }
  } catch (error) {
    content.classList.add("error");
    content.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
}

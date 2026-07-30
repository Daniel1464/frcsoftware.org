import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Compares a freshly built copy of the site (head) against a previously built
// copy (base, usually the latest `main` build) and bakes a "visual diff" UI into
// the head build: a manifest of changed pages, one diff file per changed page,
// and a small widget injected into every page. The preview workflow runs this
// before uploading `dist/` to Cloudflare Pages.

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(HERE, 'assets');

// Everything the widget needs lives under this directory in the built site.
const OUT_DIR = '_visual-diff';

const MAX_LINES_PER_PAGE = 400;

const MAIN_RE = /<main\b[^>]*>([\s\S]*?)<\/main>/i;
const BODY_RE = /<body\b[^>]*>([\s\S]*?)<\/body>/i;
const DROP_RE = /<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]+>/g;
const BLOCK_RE =
    /<\/(p|div|section|article|main|nav|header|footer|aside|li|ul|ol|tr|table|h[1-6]|pre|blockquote|dt|dd|figcaption)\s*>/gi;
const HEAD_CLOSE_RE = /<\/head>/i;

// Stands in for a block boundary while stripping tags.
const BREAK = '\u0000';

const [baseDir, headDir, docsDir] = process.argv.slice(2);

if (!baseDir || !headDir) {
    process.stderr.write(
        'Usage: node scripts/visual-diff/inject.mjs <base-dist> <head-dist> [docs-dir]\n',
    );
    process.exit(1);
}

/**
 * @param {string} dir
 * @param {string} root
 * @returns {string[]}
 */
function walk(dir, root = dir) {
    const files = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walk(full, root));
        } else {
            files.push(relative(root, full).replace(/\\/g, '/'));
        }
    }

    return files.sort();
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
    return text
        .replace(/&(?:nbsp|#160);/g, ' ')
        .replace(/&(?:amp|#38);/g, '&')
        .replace(/&(?:lt|#60);/g, '<')
        .replace(/&(?:gt|#62);/g, '>')
        .replace(/&(?:quot|#34);/g, '"')
        .replace(/&(?:apos|#39|#x27);/g, "'");
}

/**
 * Extracts the visible text of a page's main content, one line per block.
 * @param {string} html
 * @returns {string[]}
 */
function extractText(html) {
    const scoped = html.match(MAIN_RE) ?? html.match(BODY_RE);
    const region = scoped?.[1] ?? html;

    // Tags are dropped without inserting whitespace so that a line matches the
    // browser's `textContent` of the same block, which the widget relies on.
    return decodeEntities(
        region
            .replace(DROP_RE, '')
            .replace(BLOCK_RE, BREAK)
            .replace(/<br\s*\/?>/gi, BREAK)
            .replace(TAG_RE, ''),
    )
        .split(BREAK)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0);
}

/**
 * @param {string[]} base
 * @param {string[]} head
 * @returns {{ type: ' ' | '-' | '+', line: string }[]}
 */
function diffLines(base, head) {
    // Classic LCS table — the page-sized inputs here are small enough for it.
    const lcs = Array.from({ length: base.length + 1 }, () =>
        new Array(head.length + 1).fill(0),
    );

    for (let i = base.length - 1; i >= 0; i--) {
        for (let j = head.length - 1; j >= 0; j--) {
            lcs[i][j] =
                base[i] === head[j]
                    ? lcs[i + 1][j + 1] + 1
                    : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }

    const ops = [];
    let i = 0;
    let j = 0;

    while (i < base.length && j < head.length) {
        if (base[i] === head[j]) {
            ops.push({ type: ' ', line: base[i] });
            i++;
            j++;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            ops.push({ type: '-', line: base[i] });
            i++;
        } else {
            ops.push({ type: '+', line: head[j] });
            j++;
        }
    }

    while (i < base.length) ops.push({ type: '-', line: base[i++] });
    while (j < head.length) ops.push({ type: '+', line: head[j++] });

    return ops;
}

/**
 * Turns the raw diff into what the widget needs: added lines to highlight in
 * place, and removed lines with the nearest unchanged line above them so they
 * can be re-inserted as ghost blocks.
 * @param {{ type: ' ' | '-' | '+', line: string }[]} ops
 */
function toHunks(ops) {
    const added = [];
    const removed = [];
    let previous = null;

    for (const op of ops) {
        if (op.type === ' ') {
            previous = op.line;
        } else if (op.type === '+') {
            added.push({ line: op.line, after: previous });
        } else {
            removed.push({ line: op.line, after: previous });
        }
    }

    return {
        added: added.slice(0, MAX_LINES_PER_PAGE),
        removed: removed.slice(0, MAX_LINES_PER_PAGE),
    };
}

/**
 * `docs/index.html` → `/docs/`, `docs/a.html` → `/docs/a`.
 * @param {string} file
 * @returns {string}
 */
function pageUrl(file) {
    return '/' + file.replace(/index\.html$/, '').replace(/\.html$/, '');
}

/**
 * Best-effort mapping from a built page back to its `.mdx`/`.md` source.
 * @param {string} file
 * @returns {string | null}
 */
function sourceFile(file) {
    if (!docsDir) return null;

    const slug = file.replace(/\.html$/, '').replace(/\/?index$/, '');
    const candidates = slug
        ? [`${slug}.mdx`, `${slug}.md`, `${slug}/index.mdx`, `${slug}/index.md`]
        : ['index.mdx', 'index.md'];

    for (const candidate of candidates) {
        const full = join(docsDir, candidate);
        if (existsSync(full)) return `${docsDir}/${candidate}`;
    }

    return null;
}

/**
 * @param {string} url
 * @returns {string}
 */
function diffFileName(url) {
    const slug = url.replace(/^\/|\/$/g, '') || 'index';
    return `${slug.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`;
}

// ── Compare the builds ──

const isPage = (file) => file.endsWith('.html');

const baseFiles = new Set(existsSync(baseDir) ? walk(baseDir) : []);
const headFiles = walk(headDir).filter(
    (file) => !file.startsWith(`${OUT_DIR}/`),
);

const pages = [];
const diffs = new Map();

for (const file of headFiles) {
    if (!isPage(file)) continue;

    const url = pageUrl(file);
    const source = sourceFile(file);

    if (!baseFiles.has(file)) {
        pages.push({ url, source, status: 'added', added: 0, removed: 0 });
        continue;
    }

    const baseText = extractText(readFileSync(join(baseDir, file), 'utf-8'));
    const headText = extractText(readFileSync(join(headDir, file), 'utf-8'));

    if (baseText.join('\n') === headText.join('\n')) continue;

    const hunks = toHunks(diffLines(baseText, headText));
    const diff = diffFileName(url);

    diffs.set(diff, { url, source, ...hunks });
    pages.push({
        url,
        source,
        status: 'changed',
        added: hunks.added.length,
        removed: hunks.removed.length,
        diff,
    });
}

for (const file of baseFiles) {
    if (!isPage(file) || headFiles.includes(file)) continue;
    pages.push({
        url: pageUrl(file),
        source: null,
        status: 'removed',
        added: 0,
        removed: 0,
    });
}

pages.sort((a, b) => a.url.localeCompare(b.url));

// ── Write the widget payload ──

const outRoot = join(headDir, OUT_DIR);
mkdirSync(join(outRoot, 'pages'), { recursive: true });

writeFileSync(
    join(outRoot, 'manifest.json'),
    JSON.stringify(
        {
            generatedAt: new Date().toISOString(),
            baseLabel: process.env.VISUAL_DIFF_BASE_LABEL ?? 'main',
            hasBase: baseFiles.size > 0,
            pages,
        },
        null,
        2,
    ) + '\n',
    'utf-8',
);

for (const [name, diff] of diffs) {
    writeFileSync(
        join(outRoot, 'pages', name),
        JSON.stringify(diff) + '\n',
        'utf-8',
    );
}

for (const asset of ['widget.js', 'widget.css']) {
    copyFileSync(join(ASSETS_DIR, asset), join(outRoot, asset));
}

// ── Inject the widget into every page ──

const injection = [
    `<link rel="stylesheet" href="/${OUT_DIR}/widget.css">`,
    `<script src="/${OUT_DIR}/widget.js" defer></script>`,
].join('');

let injected = 0;

for (const file of headFiles) {
    if (!isPage(file)) continue;

    const full = join(headDir, file);
    const html = readFileSync(full, 'utf-8');
    if (html.includes(injection) || !HEAD_CLOSE_RE.test(html)) continue;

    writeFileSync(full, html.replace(HEAD_CLOSE_RE, `${injection}</head>`));
    injected++;
}

process.stdout.write(
    `visual diff: ${pages.length} changed page(s), widget injected into ${injected} page(s)\n`,
);

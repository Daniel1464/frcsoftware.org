// Visual diff widget for PR previews. Injected into every page of a preview
// build by scripts/visual-diff/inject.mjs, which also writes the manifest and
// per-page diffs this script reads. Plain browser JS on purpose: it is served
// as-is and must not depend on the site's bundler.

(function () {
    'use strict';

    var ROOT = '/_visual-diff';
    var STORAGE_KEY = 'visual-diff:enabled';
    var BLOCKS =
        'p, li, h1, h2, h3, h4, h5, h6, pre, td, th, blockquote, figcaption, dt, dd';

    /**
     * @typedef {{ url: string, source: string | null, status: 'added' | 'removed' | 'changed', diff?: string }} PageEntry
     * @typedef {{ generatedAt: string, baseLabel: string, hasBase: boolean, pages: PageEntry[] }} Manifest
     * @typedef {{ line: string, after: string | null }} DiffHunk
     * @typedef {{ url: string, source: string | null, added: DiffHunk[], removed: DiffHunk[] }} DiffData
     * @typedef {{ panel: HTMLElement, toggle: HTMLButtonElement, nav: HTMLSpanElement }} UI
     */

    /**
     * @type {{
     *   manifest: Manifest | null;
     *   page: PageEntry | null;
     *   diff: DiffData | null;
     *   enabled: boolean;
     *   marks: HTMLElement[];
     *   cursor: number;
     * }}
     */
    var state = {
        manifest: null,
        page: null,
        diff: null,
        enabled: false,
        marks: [],
        cursor: -1,
    };

    /**
     * @param {string | null | undefined} text
     * @returns {string}
     */
    function normalize(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function currentUrl() {
        var path = window.location.pathname;
        return path.replace(/index\.html$/, '').replace(/\.html$/, '');
    }

    /**
     * @param {Manifest} manifest
     * @returns {PageEntry | null}
     */
    function findPage(manifest) {
        var here = currentUrl();
        for (var i = 0; i < manifest.pages.length; i++) {
            var page = manifest.pages[i];
            if (!page) continue;
            if (page.url === here || page.url === here + '/') return page;
        }
        return null;
    }

    /**
     * @param {PageEntry} page
     * @returns {string}
     */
    function label(page) {
        return page.source ? page.source.replace(/^.*\/docs\//, '') : page.url;
    }

    /**
     * @returns {Element}
     */
    function contentRoot() {
        return (
            document.querySelector('.sl-markdown-content') ||
            document.querySelector('main') ||
            document.body
        );
    }

    /**
     * @param {Element} root
     * @returns {Map<string, Element[]>}
     */
    function elementsByText(root) {
        var map = new Map();
        var nodes = root.querySelectorAll(BLOCKS);

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (!node) continue;
            // Skip wrappers whose text belongs to a nested block instead.
            if (node.querySelector(BLOCKS)) continue;
            var text = normalize(node.textContent);
            if (!text) continue;
            var list = map.get(text);
            if (!list) {
                list = [];
                map.set(text, list);
            }
            list.push(node);
        }

        return map;
    }

    /**
     * @param {string} line
     * @returns {HTMLDivElement}
     */
    function ghost(line) {
        var element = document.createElement('div');
        element.className = 'vd-removed';
        element.setAttribute('data-vd-mark', 'removed');
        element.textContent = line;
        return element;
    }

    function applyDiff() {
        var root = contentRoot();
        if (!root || !state.diff) return;

        var byText = elementsByText(root);
        /** @type {Map<string, number>} */
        var used = new Map();

        /**
         * @param {string} text
         * @returns {Element | null}
         */
        function take(text) {
            var candidates = byText.get(text);
            if (!candidates || candidates.length === 0) return null;
            var index = used.get(text) || 0;
            used.set(text, index + 1);
            return (
                candidates[index] || candidates[candidates.length - 1] || null
            );
        }

        // Remembers where each context line ended up so removed blocks whose
        // anchor isn't matchable can still land near their neighbours.
        /** @type {Map<string, Element>} */
        var anchors = new Map();

        state.diff.added.forEach(function (entry) {
            var element = take(entry.line);
            if (!element) return;
            element.classList.add('vd-added');
            element.setAttribute('data-vd-mark', 'added');
            if (entry.after) anchors.set(entry.after, element);
        });

        state.diff.removed.forEach(function (entry) {
            var anchor =
                (entry.after && take(entry.after)) ||
                (entry.after && anchors.get(entry.after)) ||
                null;
            var block = ghost(entry.line);
            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore(block, anchor.nextSibling);
                if (entry.after) anchors.set(entry.after, block);
            } else {
                root.appendChild(block);
            }
        });

        state.marks = /** @type {HTMLElement[]} */ (
            Array.from(root.querySelectorAll('[data-vd-mark]'))
        );
        state.cursor = -1;
    }

    function clearDiff() {
        var marked = document.querySelectorAll('[data-vd-mark]');
        for (var i = 0; i < marked.length; i++) {
            var node = marked[i];
            if (!node) continue;
            if (node.classList.contains('vd-removed')) {
                node.remove();
            } else {
                node.classList.remove('vd-added', 'vd-current');
                node.removeAttribute('data-vd-mark');
            }
        }
        state.marks = [];
        state.cursor = -1;
    }

    /**
     * @param {number} step
     */
    function jump(step) {
        if (state.marks.length === 0) return;
        if (state.cursor >= 0) {
            var currentMark = state.marks[state.cursor];
            if (currentMark) currentMark.classList.remove('vd-current');
        }
        state.cursor =
            (state.cursor + step + state.marks.length) % state.marks.length;
        var target = state.marks[state.cursor];
        if (target) {
            target.classList.add('vd-current');
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    /**
     * @param {PageEntry | null} page
     * @returns {Promise<DiffData | null>}
     */
    async function loadDiff(page) {
        if (!page || !page.diff) return null;
        const response = await fetch(ROOT + '/pages/' + page.diff);
        return response.ok ? response.json() : null;
    }

    /**
     * @param {boolean} enabled
     * @param {UI} ui
     */
    function setEnabled(enabled, ui) {
        state.enabled = enabled;
        try {
            window.sessionStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
        } catch (error) {
            void error;
        }

        clearDiff();
        if (enabled) applyDiff();

        ui.toggle.textContent = enabled ? 'Hide diff' : 'Show diff';
        ui.toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        ui.nav.hidden = !enabled || state.marks.length === 0;
        ui.panel.classList.toggle('vd-panel--active', enabled);
    }

    /**
     * @param {Manifest} manifest
     * @param {PageEntry | null} page
     * @param {DiffData | null} diff
     */
    function build(manifest, page, diff) {
        var panel = document.createElement('div');
        panel.className = 'vd-panel';
        panel.setAttribute('data-visual-diff', '');

        var title = document.createElement('div');
        title.className = 'vd-title';
        title.textContent =
            manifest.pages.length +
            ' changed file' +
            (manifest.pages.length === 1 ? '' : 's') +
            ' vs. ' +
            manifest.baseLabel;
        panel.appendChild(title);

        var select = document.createElement('select');
        select.className = 'vd-select';
        select.setAttribute('aria-label', 'Changed files in this pull request');

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Jump to a changed file…';
        select.appendChild(placeholder);

        manifest.pages.forEach(function (/** @type {PageEntry} */ entry) {
            var option = document.createElement('option');
            option.value = entry.status === 'removed' ? '' : entry.url;
            option.disabled = entry.status === 'removed';
            option.textContent =
                (entry.status === 'added'
                    ? '＋ '
                    : entry.status === 'removed'
                      ? '－ '
                      : '● ') + label(entry);
            if (page && entry.url === page.url) option.selected = true;
            select.appendChild(option);
        });

        select.addEventListener('change', function () {
            if (select.value) window.location.pathname = select.value;
        });
        panel.appendChild(select);

        var actions = document.createElement('div');
        actions.className = 'vd-actions';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'vd-button';
        toggle.textContent = 'Show diff';

        var nav = document.createElement('span');
        nav.className = 'vd-nav';
        nav.hidden = true;

        var previous = document.createElement('button');
        previous.type = 'button';
        previous.className = 'vd-button vd-button--icon';
        previous.textContent = '↑';
        previous.title = 'Previous change';

        var next = document.createElement('button');
        next.type = 'button';
        next.className = 'vd-button vd-button--icon';
        next.textContent = '↓';
        next.title = 'Next change';

        nav.appendChild(previous);
        nav.appendChild(next);
        actions.appendChild(toggle);
        actions.appendChild(nav);
        panel.appendChild(actions);

        var hint = document.createElement('div');
        hint.className = 'vd-hint';
        panel.appendChild(hint);

        /** @type {UI} */
        var ui = { panel: panel, toggle: toggle, nav: nav };

        if (!diff) {
            toggle.disabled = true;
            hint.textContent = page
                ? 'This page was ' + page.status + '; nothing to overlay.'
                : 'This page is unchanged. Pick a file above.';
        } else {
            hint.textContent =
                '+' +
                diff.added.length +
                ' / −' +
                diff.removed.length +
                ' blocks · press d to toggle';
        }

        toggle.addEventListener('click', function () {
            setEnabled(!state.enabled, ui);
        });
        previous.addEventListener('click', function () {
            jump(-1);
        });
        next.addEventListener('click', function () {
            jump(1);
        });

        document.addEventListener('keydown', function (event) {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            var target = /** @type {HTMLElement | null} */ (event.target);
            if (
                target &&
                (target.isContentEditable ||
                    /^(input|textarea|select)$/i.test(target.tagName || ''))
            ) {
                return;
            }
            if (event.key === 'd' && diff) setEnabled(!state.enabled, ui);
            if (!state.enabled) return;
            if (event.key === 'j') jump(1);
            if (event.key === 'k') jump(-1);
        });

        document.body.appendChild(panel);

        var remembered = null;
        try {
            remembered = window.sessionStorage.getItem(STORAGE_KEY);
        } catch (error) {
            void error;
        }
        if (diff && remembered === '1') setEnabled(true, ui);
    }

    function start() {
        fetch(ROOT + '/manifest.json')
            .then(function (response) {
                return response.ok ? response.json() : null;
            })
            .then(function (/** @type {Manifest | null} */ manifest) {
                if (!manifest || manifest.pages.length === 0) return null;
                state.manifest = manifest;
                state.page = findPage(manifest);
                return loadDiff(state.page).then(function (diff) {
                    state.diff = diff;
                    build(manifest, state.page, diff);
                });
            })
            .catch(function () {
                /* previews without a diff payload simply show no widget */
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

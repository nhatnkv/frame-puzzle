export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

type Attrs = Record<string, string | number | boolean | null | undefined>;

/** Creates an element. `class` and string attributes are set as attributes; children are appended. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** An icon from the sprite in index.html. */
export function icon(name: string, style?: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  if (style) svg.setAttribute("style", style);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

/**
 * A delete button that needs two taps: the first arms it (showing `armedLabel`), the second
 * confirms. It disarms itself after a moment, so a child's stray tap does nothing.
 */
export function twoTapDelete(opts: { className: string; label: string; armedLabel: string; onConfirm: () => void }): HTMLButtonElement {
  const b = h("button", { type: "button", class: opts.className, "aria-label": opts.label });
  const reset = () => {
    b.classList.remove("armed");
    b.replaceChildren(icon("trash"));
    b.setAttribute("aria-label", opts.label);
  };
  reset();
  let timer: ReturnType<typeof setTimeout> | null = null;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (b.classList.contains("armed")) {
      if (timer) clearTimeout(timer);
      opts.onConfirm();
      return;
    }
    b.classList.add("armed");
    b.textContent = opts.armedLabel;
    b.setAttribute("aria-label", `Tap again: ${opts.armedLabel}`);
    timer = setTimeout(() => b.isConnected && reset(), 2500);
  });
  return b;
}

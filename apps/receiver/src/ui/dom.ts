export type CreateOptionsType = {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
};

/** Creates an element with an optional class, text, and attributes. */
export function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: CreateOptionsType = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.attrs !== undefined) {
    for (const [key, value] of Object.entries(options.attrs)) {
      node.setAttribute(key, value);
    }
  }
  return node;
}

/** Creates a button wired to `onClick`. */
export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = create('button', { className, text: label, attrs: { type: 'button' } });
  node.addEventListener('click', onClick);
  return node;
}

/** Replaces all children of `root` with `children`. */
export function mount(root: Element, ...children: Node[]): void {
  root.replaceChildren(...children);
}

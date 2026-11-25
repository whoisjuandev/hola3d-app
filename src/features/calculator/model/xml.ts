// A minimal XML tag scanner: enough for 3MF model files and slice info, which carry their data in attributes.
// It runs in the browser and in Node alike (DOMParser is not in Node), and does not build a tree.

export interface Tag {
  name: string; // without its namespace prefix
  attrs: Record<string, string>; // keyed by the name without its prefix too ("p:path" is "path")
  closing: boolean; // </name>
  selfClosing: boolean; // <name/>
}

const TAG_RE = /<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const local = (name: string) => name.slice(name.indexOf(':') + 1);

function decode(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, ref: string) => {
    if (ref[0] !== '#') return ENTITIES[ref] ?? whole;
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

/** Calls `onTag` for every element tag in document order. Comments are skipped. */
export function scanTags(xml: string, onTag: (tag: Tag) => void): void {
  const text = xml.includes('<!--') ? xml.replace(/<!--[\s\S]*?-->/g, '') : xml;
  for (const m of text.matchAll(TAG_RE)) {
    const rest = m[3];
    const attrs: Record<string, string> = {};
    for (const a of rest.matchAll(ATTR_RE)) attrs[local(a[1])] = decode(a[2] ?? a[3] ?? '');
    onTag({ name: local(m[2]), attrs, closing: m[1] === '/', selfClosing: rest.trimEnd().endsWith('/') });
  }
}

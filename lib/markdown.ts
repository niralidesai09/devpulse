// Markdown -> HTML for the brief (used by the email and the dashboard).
//
// Safety: post titles come from the public internet, so raw HTML inside
// the markdown is shown as text (never run), and links are only allowed
// to http(s) addresses. Links open in a new tab.

import { Marked } from "marked";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const marked = new Marked({
  gfm: true, // GitHub-style markdown: tables, etc.
  renderer: {
    // Raw HTML in the markdown -> escaped text.
    html({ text }) {
      return escapeHtml(text);
    },
    // Only real web links; everything else becomes plain text.
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!/^https?:\/\//i.test(href)) return text;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

export function markdownToHtml(markdown: string): string {
  return (
    marked
      .parse(markdown, { async: false })
      // Wide tables scroll sideways on phones instead of breaking the page.
      .replace(/<table>/g, '<div class="table-scroll"><table>')
      .replace(/<\/table>/g, "</table></div>")
  );
}

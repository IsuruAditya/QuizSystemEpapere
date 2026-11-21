import katex from "katex";
import { Fragment } from "react";

/**
 * Renders untrusted text with inline `$…$` / display `$$…$$` math via KaTeX (trust:false, no macros,
 * bounded expansion). Non-math text is rendered as React text, so imported HTML never executes.
 * Line breaks in source text are preserved.
 */
const MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

function renderMath(src: string, display: boolean): string {
  return katex.renderToString(src, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    maxSize: 20,
    maxExpand: 500,
    output: "htmlAndMathml",
    macros: {},
  });
}

export function MathText({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const parts = text.split(MATH);
  return (
    <span className={className} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {parts.map((p, i) => {
        if (p.startsWith("$$") && p.endsWith("$$") && p.length > 4)
          return <span key={i} className="block" dangerouslySetInnerHTML={{ __html: renderMath(p.slice(2, -2), true) }} />;
        if (p.startsWith("$") && p.endsWith("$") && p.length > 2) return <span key={i} dangerouslySetInnerHTML={{ __html: renderMath(p.slice(1, -1), false) }} />;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </span>
  );
}

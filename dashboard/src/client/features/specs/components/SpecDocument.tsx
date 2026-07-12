import { lazy, memo, Suspense } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type { SpecEntry, SpecNode } from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { StatusBadge } from "../../../components/StatusBadge";
import {
  buildSectionIndex,
  scrollToSection,
  sectionDomId,
} from "../utils/section-anchors";

const MermaidBlock = lazy(async () => {
  const mod = await import("../../../mermaid/MermaidBlock");
  return { default: mod.MermaidBlock };
});

export interface SpecDocumentProps {
  entry: SpecEntry | null;
  testId?: string;
}

function SpecDocumentImpl({
  entry,
  testId = "spec-document",
}: SpecDocumentProps) {
  if (!entry) {
    return (
      <EmptyState
        fact="Select a spec from the rail to read sections and diagrams."
        testId={`${testId}-empty`}
      />
    );
  }

  if (isRawEntry(entry)) {
    return (
      <article className="hf-doc" data-testid={testId}>
        <span className="hf-doc__badge" data-testid={`${testId}-degraded`}>
          Degraded — parse error
        </span>
        <h2 className="hf-doc__title">{entry.path}</h2>
        <pre className="hf-doc__raw" data-testid={`${testId}-raw`}>
          {entry.raw}
        </pre>
      </article>
    );
  }

  const spec = entry as SpecNode;
  const index = buildSectionIndex(spec.sections);

  return (
    <article className="hf-doc" data-testid={testId}>
      <h2 className="hf-doc__title" data-testid={`${testId}-title`}>
        {spec.slug}
      </h2>
      {spec.status ? (
        <StatusBadge verdict={spec.status} testId={`${testId}-status`} />
      ) : null}
      {spec.statusFields ? (
        <table
          className="hf-doc__status-table"
          data-testid={`${testId}-status-table`}
        >
          <tbody>
            {Object.entries(spec.statusFields).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {spec.tldr ? (
        <p className="hf-doc__tldr" data-testid={`${testId}-tldr`}>
          {spec.tldr}
        </p>
      ) : null}
      <nav className="hf-section-index" data-testid={`${testId}-index`}>
        <h3 className="hf-doc__section-title">Sections</h3>
        {index.map((s) => (
          <button
            key={s.anchor}
            type="button"
            className="hf-section-index__link"
            data-testid={`${testId}-index-${s.anchor}`}
            onClick={() => scrollToSection(s.anchor)}
          >
            {s.text}
          </button>
        ))}
      </nav>
      {spec.sections.map((section) => (
        <section
          key={section.anchor}
          id={sectionDomId(section.anchor)}
          data-testid={`${testId}-section-${section.anchor}`}
        >
          <h3 className="hf-doc__section-title">{section.text}</h3>
          {section.mermaidBlocks.map((src, i) => (
            <Suspense
              key={`${section.anchor}-m-${i}`}
              fallback={
                <div data-testid={`${testId}-mermaid-loading`}>
                  Loading diagram…
                </div>
              }
            >
              <MermaidBlock
                source={src}
                testId={`${testId}-mermaid-${section.anchor}-${i}`}
              />
            </Suspense>
          ))}
        </section>
      ))}
    </article>
  );
}

export const SpecDocument = memo(SpecDocumentImpl);

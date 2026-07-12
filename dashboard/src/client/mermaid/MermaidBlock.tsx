import {
  Component,
  memo,
  useEffect,
  useId,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

export interface MermaidBlockProps {
  source: string;
  testId?: string;
}

interface BoundaryState {
  error: string | null;
}

class MermaidErrorBoundary extends Component<
  { children: ReactNode; source: string; testId: string },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    const message =
      error instanceof Error ? error.message : "Mermaid render failed";
    return { error: message };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    /* boundary absorbs — document siblings keep rendering */
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="hf-mermaid" data-testid={this.props.testId}>
          <p
            className="hf-mermaid__error"
            data-testid={`${this.props.testId}-error`}
          >
            {this.state.error}
          </p>
          <pre
            className="hf-doc__raw"
            data-testid={`${this.props.testId}-raw`}
          >
            {this.props.source}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function MermaidInner({
  source,
  testId,
}: {
  source: string;
  testId: string;
}) {
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
        });
        const id = `hf-mermaid-${reactId}`;
        const { svg: rendered } = await mermaid.render(id, source);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Mermaid render failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, reactId]);

  if (error) {
    return (
      <div className="hf-mermaid" data-testid={testId}>
        <p className="hf-mermaid__error" data-testid={`${testId}-error`}>
          {error}
        </p>
        <pre className="hf-doc__raw" data-testid={`${testId}-raw`}>
          {source}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="hf-mermaid" data-testid={testId}>
        <span data-testid={`${testId}-loading`}>Rendering diagram…</span>
      </div>
    );
  }

  return (
    <div
      className="hf-mermaid"
      data-testid={testId}
      // Mermaid SVG is sandboxed client-side (securityLevel: strict).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function MermaidBlockImpl({
  source,
  testId = "mermaid-block",
}: MermaidBlockProps) {
  return (
    <MermaidErrorBoundary source={source} testId={testId}>
      <MermaidInner source={source} testId={testId} />
    </MermaidErrorBoundary>
  );
}

export const MermaidBlock = memo(MermaidBlockImpl);

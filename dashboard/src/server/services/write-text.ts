/**
 * BOM / CRLF preservation helpers for the write door (spec §4.2).
 */

export function detectLineEnding(buf: Buffer): "\r\n" | "\n" {
  const text = buf.toString("utf8");
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function hasBom(buf: Buffer): boolean {
  return (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  );
}

/**
 * Apply logical contents while preserving original BOM and line endings.
 */
export function preserveTextForm(
  contents: string,
  prior: Buffer | null,
): Buffer {
  let body = contents;
  body = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (prior && prior.length > 0) {
    const ending = detectLineEnding(prior);
    if (ending === "\r\n") {
      body = body.replace(/\n/g, "\r\n");
    }
    if (hasBom(prior) && !body.startsWith("\uFEFF")) {
      return Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(body, "utf8"),
      ]);
    }
  }
  return Buffer.from(body, "utf8");
}

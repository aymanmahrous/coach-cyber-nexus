/** Reject HTTP-success envelopes that report an application failure. */
export function isFunctionFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  return value.success === false || value.ok === false || Boolean(value.error);
}

/** Gemini may return thought parts before the answer, or multiple text parts. */
export function geminiAnswer(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates)) return "";
  const candidate = candidates[0];
  if (!candidate || typeof candidate !== "object") return "";
  const content = candidate.content;
  if (!content || typeof content !== "object" || !Array.isArray(content.parts)) return "";
  return content.parts
    .filter(
      (part: unknown): part is { text: string; thought?: boolean } =>
        Boolean(part) &&
        typeof part === "object" &&
        typeof (part as Record<string, unknown>).text === "string" &&
        (part as Record<string, unknown>).thought !== true,
    )
    .map((part: { text: string }) => part.text)
    .join("")
    .trim();
}
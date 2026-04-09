/**
 * Text chunking for Data Bank / RAG (Phase 8.5)
 *
 * Strategy:
 *  1. Split on paragraph breaks (≥2 newlines).
 *  2. Accumulate paragraphs into a chunk until it would exceed `chunkSize`.
 *  3. If a single paragraph exceeds `chunkSize * 2` it is split on sentence
 *     boundaries so individual chunks stay manageable.
 *
 * Default chunk size is 500 characters (~125 tokens), which fits comfortably
 * inside the 8 192-token limit of text-embedding-3-small.
 */

const DEFAULT_CHUNK_SIZE = 500;

/** Split `text` on sentence-ending punctuation followed by whitespace. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Chunk `text` into segments of at most `chunkSize` characters.
 * Returns an array of non-empty strings.
 */
export function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
  };

  for (const para of paragraphs) {
    if (para.length > chunkSize * 2) {
      // Large paragraph — split into sentences first
      flush();
      for (const sentence of splitSentences(para)) {
        if (current.length + sentence.length + 1 > chunkSize && current.length > 0) {
          flush();
        }
        current += (current ? ' ' : '') + sentence;
      }
      flush();
    } else {
      const separator = current ? '\n\n' : '';
      if (current.length + separator.length + para.length > chunkSize && current.length > 0) {
        flush();
      }
      current += (current ? '\n\n' : '') + para;
    }
  }

  flush();
  return chunks;
}

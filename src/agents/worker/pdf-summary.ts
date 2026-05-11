const FRONT_MATTER_LINE_PATTERNS = [
  /^Title:/i,
  /^URL Source:/i,
  /^Published Time:/i,
  /^Markdown Content:/i,
  /^Page \d+(?:\s+of\s+\d+)?$/i,
  /^>\s*[ivxlcdm0-9]+$/iu,
];

const FRONT_MATTER_PARAGRAPH_PATTERNS = [
  /^Confidential\b/i,
  /^Table of Contents\b/i,
  /^Document Control\b/i,
  /^Approval Log\b/i,
  /^Prepared for\b/i,
  /^Revision\b/i,
  /^Version\b/i,
];

const TRAILING_PARAGRAPH_PATTERNS = [
  /^#{0,6}\s*Appendix\b/i,
  /^#{0,6}\s*References\b/i,
];

export interface PreparedPdfDocument {
  title: string | null;
  cleanedText: string;
  bodyText: string;
  chunks: string[];
}

export function cleanupDocumentText(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => !FRONT_MATTER_LINE_PATTERNS.some((pattern) => pattern.test(line.trim())))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detectBodyStartIndex(paragraphs: string[]): number {
  const { title, hasHeadingTitle } = deriveDocumentTitle(paragraphs.join('\n\n'));

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index]?.trim() ?? '';
    if (!paragraph || (hasHeadingTitle && normalizeHeadingParagraph(paragraph) === title)) {
      continue;
    }

    if (isTrailingParagraph(paragraph)) {
      return paragraphs.length;
    }

    if (isFrontMatterParagraph(paragraph)) {
      continue;
    }

    return index;
  }

  return paragraphs.length;
}

export function detectBodyEndIndex(paragraphs: string[], startIndex: number): number {
  for (let index = startIndex; index < paragraphs.length; index += 1) {
    if (isTrailingParagraph(paragraphs[index] ?? '')) {
      return Math.max(startIndex, index - 1);
    }
  }

  return Math.max(startIndex, paragraphs.length - 1);
}

export function chunkBodyText(bodyText: string, maxChars = 6000): string[] {
  const paragraphs = splitParagraphs(bodyText);
  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        chunks.push(paragraph.slice(offset, offset + maxChars).trim());
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function preparePdfDocument(raw: string, maxChunkChars = 6000): PreparedPdfDocument {
  const cleanedText = cleanupDocumentText(raw);
  const paragraphs = splitParagraphs(cleanedText);
  const { title, hasHeadingTitle } = deriveDocumentTitle(cleanedText);

  if (paragraphs.length === 0) {
    return {
      title,
      cleanedText,
      bodyText: '',
      chunks: [],
    };
  }

  const startIndex = detectBodyStartIndex(paragraphs);
  if (startIndex >= paragraphs.length) {
    return {
      title,
      cleanedText,
      bodyText: '',
      chunks: [],
    };
  }

  const endIndex = detectBodyEndIndex(paragraphs, startIndex);
  const bodyText = paragraphs
    .slice(startIndex, endIndex + 1)
    .filter((paragraph) => !(hasHeadingTitle && normalizeHeadingParagraph(paragraph) === title))
    .join('\n\n')
    .trim();

  return {
    title,
    cleanedText,
    bodyText,
    chunks: chunkBodyText(bodyText, maxChunkChars),
  };
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
}

function deriveDocumentTitle(text: string): { title: string | null; hasHeadingTitle: boolean } {
  const headingMatch = text.match(/^#\s+(.+?)(?:\n|$)/);
  if (headingMatch) {
    return { title: headingMatch[1].trim(), hasHeadingTitle: true };
  }

  return { title: splitParagraphs(text)[0] ?? null, hasHeadingTitle: false };
}

function isFrontMatterParagraph(paragraph: string): boolean {
  if (FRONT_MATTER_PARAGRAPH_PATTERNS.some((pattern) => pattern.test(paragraph))) {
    return true;
  }

  return looksLikeStructuredFrontMatter(paragraph);
}

function isTrailingParagraph(paragraph: string): boolean {
  return TRAILING_PARAGRAPH_PATTERNS.some((pattern) => pattern.test(paragraph.trim()));
}

function looksLikeStructuredFrontMatter(paragraph: string): boolean {
  const lines = paragraph
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return false;
  }

  return lines.every((line) => {
    if (/^[A-Z][A-Za-z /-]+:\s*[^\s].*$/.test(line)) {
      return true;
    }

    return false;
  });
}

function normalizeHeadingParagraph(paragraph: string): string {
  return paragraph.replace(/^#+\s+/, '').trim();
}

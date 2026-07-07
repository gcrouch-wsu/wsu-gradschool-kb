import WordExtractor from "word-extractor";
import type { ParsedDocx } from "@/lib/docx-import";
import { convertPlainTextToBlocks } from "@/lib/text-import";

/**
 * Parses a legacy binary Word document (.doc, Word 97-2003). These files store
 * their content in an OLE compound format that `mammoth` cannot read, so we fall
 * back to text extraction only — images and rich formatting are not preserved.
 */
export async function convertDocToBlocks(buffer: Buffer, fallbackTitle: string): Promise<ParsedDocx> {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  const parsed = convertPlainTextToBlocks(document.getBody(), fallbackTitle);
  return {
    ...parsed,
    messages: [
      "Legacy .doc files are imported as text only. Images and rich formatting are not preserved — for best results, re-save as .docx before importing.",
      ...parsed.messages,
    ],
  };
}

declare module "word-extractor" {
  interface WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(options?: { includeFooters?: boolean }): string;
    getFooters(): string;
    getAnnotations(): string;
    getEndnotes(): string;
  }

  class WordExtractor {
    extract(source: string | Buffer): Promise<WordDocument>;
  }

  export = WordExtractor;
}

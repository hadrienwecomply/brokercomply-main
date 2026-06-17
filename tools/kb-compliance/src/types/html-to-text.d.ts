declare module 'html-to-text' {
  export interface HtmlToTextOptions {
    wordwrap?: number | false | null;
    selectors?: Array<{
      selector: string;
      format?: string;
      options?: Record<string, unknown>;
    }>;
    [key: string]: unknown;
  }
  export function convert(html: string, options?: HtmlToTextOptions): string;
  export const htmlToText: typeof convert;
}

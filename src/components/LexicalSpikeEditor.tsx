"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $getRoot, $insertNodes, type EditorState, type LexicalEditor } from "lexical";
import { blocksToDocumentHtml, documentHtmlToBlocks } from "@/lib/page-document";
import type { ContentBlock } from "@/lib/types";

const INITIAL_BLOCKS: ContentBlock[] = [
  { blockId: "spike-h2", type: "heading", level: 2, text: "Lexical spike heading" },
  {
    blockId: "spike-p",
    type: "paragraph",
    text: "Paragraph with a short sentence for round-trip checks.",
    html: "Paragraph with a short sentence for round-trip checks.",
  },
  {
    blockId: "spike-list",
    type: "list",
    ordered: false,
    items: ["First item", "Second item"],
    itemHtml: ["First item", "Second item"],
  },
];

function theme() {
  return {
    paragraph: "doc-p",
    heading: { h2: "doc-h2", h3: "doc-h3" },
    list: { ul: "doc-ul", ol: "doc-ol", listitem: "doc-li" },
    link: "doc-a",
    text: { bold: "doc-strong", italic: "doc-em", underline: "doc-u" },
  };
}

function HydrateFromHtmlPlugin({ html }: { html: string }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.update(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(html, "text/html");
      const nodes = $generateNodesFromDOM(editor, dom);
      const root = $getRoot();
      root.clear();
      root.select();
      $insertNodes(nodes);
    });
  }, [editor, html]);
  return null;
}

export function LexicalSpikeEditor() {
  const seedHtml = useMemo(() => blocksToDocumentHtml(INITIAL_BLOCKS), []);
  const [blocksJson, setBlocksJson] = useState(() => JSON.stringify(INITIAL_BLOCKS, null, 2));
  const [roundTripOk, setRoundTripOk] = useState<boolean | null>(null);
  const [lastHtml, setLastHtml] = useState(seedHtml);
  const [error, setError] = useState<string | null>(null);

  const initialConfig = useMemo(
    () => ({
      namespace: "lexical-spike",
      theme: theme(),
      onError(err: Error) {
        setError(err.message);
      },
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode],
    }),
    [],
  );

  const handleChange = useCallback((editorState: EditorState, editor: LexicalEditor) => {
    editorState.read(() => {
      const html = $generateHtmlFromNodes(editor, null);
      setLastHtml(html);
      try {
        const blocks = documentHtmlToBlocks(html);
        setBlocksJson(JSON.stringify(blocks, null, 2));
        const again = blocksToDocumentHtml(blocks);
        const stable = documentHtmlToBlocks(again);
        setRoundTripOk(JSON.stringify(blocks.map(stripIds)) === JSON.stringify(stable.map(stripIds)));
        setError(null);
      } catch (err) {
        setRoundTripOk(false);
        setError(err instanceof Error ? err.message : "Round-trip failed");
      }
    });
  }, []);

  return (
    <div className="admin-panel" style={{ display: "grid", gap: "1rem" }}>
      <p className="meta">
        Phase 0 spike: Lexical mounts HTML from <code>blocksToDocumentHtml</code>, then parses back
        through <code>documentHtmlToBlocks</code>. Storage boundary stays <code>ContentBlock[]</code>.
      </p>
      <LexicalComposer initialConfig={initialConfig}>
        <div className="wysiwyg-surface" style={{ minHeight: "12rem", border: "1px solid #ccc", padding: "0.75rem" }}>
          <RichTextPlugin
            contentEditable={<ContentEditable className="lexical-spike-editable" aria-label="Lexical spike editor" />}
            placeholder={<div className="meta">Start typing…</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <HydrateFromHtmlPlugin html={seedHtml} />
          <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
        </div>
      </LexicalComposer>
      <div>
        <strong>Round-trip stable (ignoring block ids): </strong>
        {roundTripOk === null ? "…" : roundTripOk ? "yes" : "no"}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <details open>
        <summary>Serialized blocks</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{blocksJson}</pre>
      </details>
      <details>
        <summary>Last HTML from Lexical</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{lastHtml}</pre>
      </details>
    </div>
  );
}

function stripIds(block: ContentBlock): unknown {
  const { blockId: _id, ...rest } = block;
  return rest;
}

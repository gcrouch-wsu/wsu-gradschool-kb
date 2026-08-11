"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $createParagraphNode, $getRoot, type EditorState, type LexicalEditor, type LexicalNode } from "lexical";
import { $isPreservedBlockNode, PreservedBlockNode } from "@/lib/lexical/preserved-block-node";
import {
  $createEditorBoundaryParagraphNode,
  EditorBoundaryParagraphNode,
} from "@/lib/lexical/editor-boundary-paragraph-node";
import { AlertNode } from "@/lib/lexical/alert-node";
import { NoteNode } from "@/lib/lexical/note-node";
import {
  hasActiveLexicalEditor,
  registerLexicalFlowEditor,
  unregisterLexicalFlowEditor,
} from "@/lib/lexical/toolbar-bridge";
import {
  bindPageEditor,
  handleEditorDrop,
  handleEditorKeyDown,
  handleEditorPaste,
  handleImageControlClick,
  refreshEditorFormatting,
} from "@/lib/page-editor-format";
import { noteEditorInput } from "@/lib/page-editor-undo";

function theme() {
  return {
    paragraph: "doc-p",
    heading: { h2: "anchor-heading", h3: "anchor-heading" },
    list: {
      ul: "doc-ul",
      ol: "doc-ol",
      listitem: "doc-li",
      nested: { listitem: "doc-li" },
    },
    link: "doc-a",
    text: { bold: "doc-strong", italic: "doc-em", underline: "doc-u" },
  };
}

function addPreservedBlockBoundaries(nodes: LexicalNode[]): LexicalNode[] {
  const out: LexicalNode[] = [];
  for (const node of nodes) {
    if ($isPreservedBlockNode(node) && (out.length === 0 || $isPreservedBlockNode(out[out.length - 1]))) {
      out.push($createEditorBoundaryParagraphNode());
    }
    out.push(node);
  }
  if (out.length > 0 && $isPreservedBlockNode(out[out.length - 1])) {
    out.push($createEditorBoundaryParagraphNode());
  }
  return out;
}

function HydrateOncePlugin({ initialHtml }: { initialHtml: string }) {
  const [editor] = useLexicalComposerContext();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) {
      return;
    }
    done.current = true;
    editor.update(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(initialHtml || "<p><br></p>", "text/html");
      const nodes = $generateNodesFromDOM(editor, dom);
      const root = $getRoot();
      root.clear();
      if (nodes.length > 0) {
        root.append(...addPreservedBlockBoundaries(nodes));
      } else {
        root.append($createParagraphNode());
      }
    });
  }, [editor, initialHtml]);
  return null;
}

function BridgePlugin({
  onHtmlChange,
  kbId,
}: {
  onHtmlChange: (html: string, isBlur: boolean) => void;
  kbId: string;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) {
      return;
    }
    const emit = () => {
      editor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(editor, null);
        onHtmlChange(html, false);
      });
    };
    const activate = () => {
      registerLexicalFlowEditor(editor, root, emit);
      bindPageEditor(root, emit);
    };
    // Claim the shared toolbar on mount only when no live surface holds it; focus is what
    // hands ownership over after that. Binding unconditionally here let a surface that
    // mounted later steal the target from the one the caret was in (FB-39).
    if (!hasActiveLexicalEditor()) {
      activate();
    }
    root.addEventListener("focusin", activate);
    return () => {
      root.removeEventListener("focusin", activate);
      unregisterLexicalFlowEditor(editor);
      // Deliberately does NOT clear the shared selection binding. Doing so looked like tidy
      // defence-in-depth and caused an intermittent editor bug: DOM surgery (list indent)
      // restructures blocks and unmounts a surface while the caret stays inside a surviving
      // one. `focusin` only fires when focus *enters* an element, so focus never leaving means
      // nothing rebinds — the next Tab found no bound surface and silently did nothing, so a
      // three-level list stopped nesting at two. `hasActiveLexicalEditor()` already treats a
      // detached root as free, which is what lets the next surface claim the toolbar.
    };
  }, [editor, onHtmlChange]);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      handleEditorKeyDown(event as unknown as React.KeyboardEvent<HTMLElement>);
    };
    const onPaste = (event: ClipboardEvent) => {
      handleEditorPaste(event as unknown as React.ClipboardEvent<HTMLElement>, kbId);
    };
    const onDrop = (event: DragEvent) => {
      handleEditorDrop(event as unknown as React.DragEvent<HTMLElement>, kbId);
    };
    const onClick = (event: MouseEvent) => {
      handleImageControlClick(event as unknown as React.MouseEvent<HTMLElement>);
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("paste", onPaste);
    root.addEventListener("drop", onDrop);
    root.addEventListener("click", onClick);
    root.addEventListener("dragover", onDragOver);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("drop", onDrop);
      root.removeEventListener("click", onClick);
      root.removeEventListener("dragover", onDragOver);
    };
  }, [editor, kbId]);

  return null;
}

export function LexicalFlowSurface({
  initialHtml,
  kbId,
  onHtmlChange,
}: {
  initialHtml: string;
  kbId: string;
  onHtmlChange: (html: string, isBlur: boolean) => void;
}) {
  const onHtmlChangeRef = useRef(onHtmlChange);
  useEffect(() => {
    onHtmlChangeRef.current = onHtmlChange;
  }, [onHtmlChange]);

  const initialConfig = useMemo(
    () => ({
      namespace: "kb-flow",
      theme: theme(),
      onError(error: Error) {
        console.error(error);
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        LinkNode,
        AutoLinkNode,
        PreservedBlockNode,
        EditorBoundaryParagraphNode,
        AlertNode,
        NoteNode,
      ],
    }),
    [],
  );

  const handleChange = useCallback((_state: EditorState, editor: LexicalEditor) => {
    editor.getEditorState().read(() => {
      const nextHtml = $generateHtmlFromNodes(editor, null);
      onHtmlChangeRef.current(nextHtml, false);
      refreshEditorFormatting();
    });
  }, []);

  const stableOnChange = useCallback((html: string, isBlur: boolean) => {
    onHtmlChangeRef.current(html, isBlur);
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="lexical-flow-shell">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Page body"
              className="wysiwyg-surface lexical-flow-surface"
              onInput={(event) => {
                noteEditorInput(event.nativeEvent as InputEvent);
                refreshEditorFormatting();
              }}
              onKeyUp={() => refreshEditorFormatting()}
              onMouseUp={() => refreshEditorFormatting()}
            />
          }
          placeholder={<div className="meta lexical-flow-placeholder">Start writing…</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <HydrateOncePlugin initialHtml={initialHtml} />
        <BridgePlugin kbId={kbId} onHtmlChange={stableOnChange} />
        <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
      </div>
    </LexicalComposer>
  );
}

"use client";

import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $createParagraphNode, $getRoot, type EditorState, type LexicalEditor } from "lexical";
import {
  hasActiveLexicalEditor,
  registerLexicalFlowEditor,
  unregisterLexicalFlowEditor,
} from "@/lib/lexical/toolbar-bridge";
import { getBoundEditorSurface } from "@/lib/rich-text-selection";
import {
  bindPageEditor,
  handleEditorKeyDown,
  handleEditorPaste,
  handleImageControlClick,
  refreshEditorFormatting,
} from "@/lib/page-editor-format";
import { noteEditorInput } from "@/lib/page-editor-undo";
import { richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";

function theme() {
  return {
    paragraph: "doc-p",
    link: "doc-a",
    text: { bold: "doc-strong", italic: "doc-em", underline: "doc-u" },
  };
}

function wrapInlineHtml(html: string) {
  const trimmed = html.trim();
  if (!trimmed) {
    return "<p><br></p>";
  }
  // Cell storage is inline rich text; Lexical needs a block root to hydrate.
  if (/^<(p|h[1-6]|ul|ol|div|blockquote)\b/i.test(trimmed)) {
    return trimmed;
  }
  return `<p>${trimmed}</p>`;
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
      const dom = parser.parseFromString(wrapInlineHtml(initialHtml), "text/html");
      const nodes = $generateNodesFromDOM(editor, dom);
      const root = $getRoot();
      root.clear();
      if (nodes.length > 0) {
        root.append(...nodes);
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
        const html = sanitizeRichText($generateHtmlFromNodes(editor, null));
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
      // Release the selection binding too, so a detached root cannot keep receiving
      // toolbar commands after this surface goes away.
      if (getBoundEditorSurface() === root) {
        bindPageEditor(null, () => {});
      }
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
    const onClick = (event: MouseEvent) => {
      handleImageControlClick(event as unknown as React.MouseEvent<HTMLElement>);
    };
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("paste", onPaste);
    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("click", onClick);
    };
  }, [editor, kbId]);

  return null;
}

/** Nested Lexical editor for a single table cell (FB-26). */
export function LexicalTableCellSurface({
  initialHtml,
  kbId,
  onChange,
}: {
  initialHtml: string;
  kbId: string;
  onChange: (html: string, text: string) => void;
}) {
  const reactId = useId();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const initialConfig = useMemo(
    () => ({
      namespace: `kb-table-cell-${reactId}`,
      theme: theme(),
      onError(error: Error) {
        console.error(error);
      },
      nodes: [LinkNode, AutoLinkNode],
    }),
    [reactId],
  );

  const emit = useCallback((html: string) => {
    const clean = sanitizeRichText(html);
    onChangeRef.current(clean, richTextToPlainText(clean));
  }, []);

  const handleChange = useCallback((_state: EditorState, editor: LexicalEditor) => {
    editor.getEditorState().read(() => {
      emit($generateHtmlFromNodes(editor, null));
      refreshEditorFormatting();
    });
  }, [emit]);

  const stableOnChange = useCallback(
    (html: string, _isBlur: boolean) => {
      emit(html);
    },
    [emit],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="lexical-table-cell-shell">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Table cell"
              className="wysiwyg-table-cell lexical-table-cell"
              onInput={(event) => {
                noteEditorInput(event.nativeEvent as InputEvent);
                refreshEditorFormatting();
              }}
              onKeyUp={() => refreshEditorFormatting()}
              onMouseUp={() => refreshEditorFormatting()}
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <LinkPlugin />
        <HydrateOncePlugin initialHtml={initialHtml} />
        <BridgePlugin kbId={kbId} onHtmlChange={stableOnChange} />
        <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
      </div>
    </LexicalComposer>
  );
}

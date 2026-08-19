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
import { lexicalHtmlConfig } from "@/lib/lexical/html-export";
import {
  hasActiveLexicalEditor,
  registerLexicalFlowEditor,
  trackLexicalFlowSurface,
  unregisterLexicalFlowEditor,
} from "@/lib/lexical/toolbar-bridge";
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

  const onHtmlChangeRef = useRef(onHtmlChange);
  useEffect(() => {
    onHtmlChangeRef.current = onHtmlChange;
  }, [onHtmlChange]);

  useEffect(() => {
    const emit = () => {
      editor.getEditorState().read(() => {
        const html = sanitizeRichText($generateHtmlFromNodes(editor, null));
        onHtmlChangeRef.current(html, false);
      });
    };
    let currentRoot: HTMLElement | null = null;
    let untrack: (() => void) | null = null;
    const activate = () => {
      if (!currentRoot) {
        return;
      }
      registerLexicalFlowEditor(editor, currentRoot, emit);
      bindPageEditor(currentRoot, emit);
    };
    const detach = (root: HTMLElement | null) => {
      root?.removeEventListener("focusin", activate);
      untrack?.();
      untrack = null;
    };
    const removeRootListener = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        detach(prevRootElement);
      }
      currentRoot = rootElement;
      if (!rootElement) {
        return;
      }
      untrack = trackLexicalFlowSurface(editor, { root: rootElement, onMutate: emit, claim: activate });
      // Claim the shared toolbar on mount only when no live surface holds it; focus is what
      // hands ownership over after that. Binding unconditionally here let a surface that
      // mounted later steal the target from the one the caret was in (FB-39).
      if (!hasActiveLexicalEditor()) {
        activate();
      }
      rootElement.addEventListener("focusin", activate);
    });
    return () => {
      removeRootListener();
      detach(currentRoot);
      unregisterLexicalFlowEditor(editor);
      // Deliberately does NOT clear the shared selection binding. Doing so looked like tidy
      // defence-in-depth and caused an intermittent editor bug: DOM surgery (list indent)
      // restructures blocks and unmounts a surface while the caret stays inside a surviving
      // one. `focusin` only fires when focus *enters* an element, so focus never leaving means
      // nothing rebinds — the next Tab found no bound surface and silently did nothing, so a
      // three-level list stopped nesting at two. Ownership is re-derived from DOM focus by
      // the bridge, which is what lets the surviving surface take over.
    };
  }, [editor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleEditorKeyDown(event as unknown as React.KeyboardEvent<HTMLElement>);
    };
    const onPaste = (event: ClipboardEvent) => {
      handleEditorPaste(event as unknown as React.ClipboardEvent<HTMLElement>, kbId);
    };
    const onClick = (event: MouseEvent) => {
      handleImageControlClick(event as unknown as React.MouseEvent<HTMLElement>);
    };
    const attach = (root: HTMLElement) => {
      root.addEventListener("keydown", onKeyDown);
      root.addEventListener("paste", onPaste);
      root.addEventListener("click", onClick);
    };
    const detach = (root: HTMLElement) => {
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("click", onClick);
    };
    let currentRoot: HTMLElement | null = null;
    const removeRootListener = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        detach(prevRootElement);
      }
      currentRoot = rootElement;
      if (rootElement) {
        attach(rootElement);
      }
    });
    return () => {
      removeRootListener();
      if (currentRoot) {
        detach(currentRoot);
      }
    };
  }, [editor, kbId]);

  return null;
}

/** Nested Lexical editor for a single table cell (FB-26). */
export function LexicalTableCellSurface({
  initialHtml,
  kbId,
  onChange,
  onFocus,
}: {
  initialHtml: string;
  kbId: string;
  onChange: (html: string, text: string) => void;
  onFocus?: () => void;
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
      html: lexicalHtmlConfig,
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
              onFocus={onFocus}
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

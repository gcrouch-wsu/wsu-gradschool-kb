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
import {
  $createParagraphNode,
  $getRoot,
  COMMAND_PRIORITY_CRITICAL,
  DROP_COMMAND,
  PASTE_COMMAND,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $isPreservedBlockNode, PreservedBlockNode } from "@/lib/lexical/preserved-block-node";
import {
  $createEditorBoundaryParagraphNode,
  EditorBoundaryParagraphNode,
} from "@/lib/lexical/editor-boundary-paragraph-node";
import { AlertNode } from "@/lib/lexical/alert-node";
import { NoteNode } from "@/lib/lexical/note-node";
import { lexicalHtmlConfig } from "@/lib/lexical/html-export";
import {
  hasActiveLexicalEditor,
  registerLexicalFlowEditor,
  trackLexicalFlowSurface,
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
      // Additive, not a replacement: Lexical adds this class to the structural <li>
      // that only wraps a nested list. It must hide its own marker, or the editor
      // paints an empty numbered/bulleted item before every indented group — which
      // the public renderer never shows, because it nests sub-lists inside the parent
      // item's content instead of using a wrapper.
      nested: { listitem: "doc-li--nested" },
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

type ImageBlock = Extract<import("@/lib/types").ContentBlock, { type: "image" }>;

function BridgePlugin({
  onHtmlChange,
  onFocus,
  onImageFiles,
  onImageBlocks,
  kbId,
}: {
  onHtmlChange: (html: string, isBlur: boolean) => void;
  onFocus?: () => void;
  onImageFiles?: (files: File[], source: "paste" | "drop") => void;
  onImageBlocks?: (blocks: ImageBlock[], source: "paste" | "drop") => void;
  kbId: string;
}) {
  const [editor] = useLexicalComposerContext();
  // Every callback below arrives as a fresh closure on each parent render. Keeping
  // them behind refs is what lets the effects depend on `editor` alone: an effect
  // that re-ran on callback identity tore down and re-registered this surface on
  // every keystroke, and the re-registration pass handed the shared toolbar to the
  // first flow on the page instead of the one holding the caret.
  const onFocusRef = useRef(onFocus);
  const onHtmlChangeRef = useRef(onHtmlChange);
  const onImageFilesRef = useRef(onImageFiles);
  const onImageBlocksRef = useRef(onImageBlocks);

  useEffect(() => {
    onFocusRef.current = onFocus;
    onHtmlChangeRef.current = onHtmlChange;
    onImageFilesRef.current = onImageFiles;
    onImageBlocksRef.current = onImageBlocks;
  }, [onFocus, onHtmlChange, onImageBlocks, onImageFiles]);

  useEffect(() => {
    const emit = () => {
      editor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(editor, null);
        onHtmlChangeRef.current(html, false);
      });
    };
    let currentRoot: HTMLElement | null = null;
    let untrack: (() => void) | null = null;
    const claimToolbar = () => {
      if (!currentRoot) {
        return;
      }
      registerLexicalFlowEditor(editor, currentRoot, emit);
      bindPageEditor(currentRoot, emit);
    };
    const activate = () => {
      onFocusRef.current?.();
      claimToolbar();
    };
    const detach = (root: HTMLElement | null) => {
      root?.removeEventListener("focusin", activate);
      untrack?.();
      untrack = null;
    };
    // registerRootListener fires immediately with the current root and again whenever
    // Lexical swaps it, so this effect never has to guess whether ContentEditable has
    // mounted yet.
    const removeRootListener = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        detach(prevRootElement);
      }
      currentRoot = rootElement;
      if (!rootElement) {
        return;
      }
      untrack = trackLexicalFlowSurface(editor, { root: rootElement, onMutate: emit, claim: claimToolbar });
      // Claim the shared toolbar on mount only when no live surface holds it; focus is
      // what hands ownership over after that. Binding unconditionally here let a surface
      // that mounted later steal the target from the one the caret was in (FB-39).
      if (!hasActiveLexicalEditor()) {
        claimToolbar();
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
    // Resolved per event so an omitted handler still falls back to the built-in
    // insert path rather than swallowing the images.
    const pasteOptions = () => {
      const onFiles = onImageFilesRef.current;
      const onBlocks = onImageBlocksRef.current;
      return onFiles || onBlocks ? { onImageFiles: onFiles, onImageBlocks: onBlocks } : undefined;
    };
    const onClick = (event: MouseEvent) => {
      handleImageControlClick(event as unknown as React.MouseEvent<HTMLElement>);
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
      }
    };
    const attach = (root: HTMLElement) => {
      root.addEventListener("keydown", onKeyDown);
      root.addEventListener("click", onClick);
      root.addEventListener("dragover", onDragOver);
    };
    const detach = (root: HTMLElement) => {
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("click", onClick);
      root.removeEventListener("dragover", onDragOver);
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
    // Paste and drop go through Lexical's commands, NOT a DOM listener on the root.
    // Lexical attaches its own paste listener to that same element and reads the
    // clipboard itself; `preventDefault()` does not stop a sibling listener, so a DOM
    // handler here meant rich paste was inserted twice — once by us and once by
    // Lexical. Claiming the command at CRITICAL priority and returning true is what
    // suppresses Lexical's default. Returning false (plain text, no images) lets
    // Lexical handle it normally.
    const removePaste = editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) =>
        handleEditorPaste(event as unknown as React.ClipboardEvent<HTMLElement>, kbId, pasteOptions()),
      COMMAND_PRIORITY_CRITICAL,
    );
    const removeDrop = editor.registerCommand(
      DROP_COMMAND,
      (event: DragEvent) =>
        handleEditorDrop(event as unknown as React.DragEvent<HTMLElement>, kbId, pasteOptions()),
      COMMAND_PRIORITY_CRITICAL,
    );
    return () => {
      removeRootListener();
      removePaste();
      removeDrop();
      if (currentRoot) {
        detach(currentRoot);
      }
    };
  }, [editor, kbId]);

  return null;
}

export function LexicalFlowSurface({
  initialHtml,
  kbId,
  onHtmlChange,
  onFocus,
  onImageFiles,
  onImageBlocks,
}: {
  initialHtml: string;
  kbId: string;
  onHtmlChange: (html: string, isBlur: boolean) => void;
  onFocus?: () => void;
  onImageFiles?: (files: File[], source: "paste" | "drop") => void;
  onImageBlocks?: (blocks: ImageBlock[], source: "paste" | "drop") => void;
}) {
  const onHtmlChangeRef = useRef(onHtmlChange);
  useEffect(() => {
    onHtmlChangeRef.current = onHtmlChange;
  }, [onHtmlChange]);

  const initialConfig = useMemo(
    () => ({
      namespace: "kb-flow",
      theme: theme(),
      html: lexicalHtmlConfig,
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
        <BridgePlugin
          kbId={kbId}
          onFocus={onFocus}
          onHtmlChange={stableOnChange}
          onImageBlocks={onImageBlocks}
          onImageFiles={onImageFiles}
        />
        <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
      </div>
    </LexicalComposer>
  );
}

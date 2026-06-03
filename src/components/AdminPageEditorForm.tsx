"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { richTextToPlainText, sanitizeRichText, textToRichText } from "@/lib/rich-text";
import type { ContentBlock, KbPage, KnowledgeBase, PageStatus, PageVisibility } from "@/lib/types";

interface ParentOption {
  path: string;
  title: string;
  depth: number;
  status: PageStatus;
}

type EditableStatus = "draft" | "published";
type AddableBlockType = "paragraph" | "heading" | "list" | "alert" | "image" | "table";
type RichTextElement = "div" | "h2" | "h3" | "li";

function newBlock(type: AddableBlockType): ContentBlock {
  const blockId = `block-${crypto.randomUUID()}`;
  if (type === "heading") {
    return { blockId, type, level: 2, text: "New heading" };
  }
  if (type === "list") {
    return { blockId, type, items: ["New list item"] };
  }
  if (type === "alert") {
    return { blockId, type, variant: "info", text: "Important note" };
  }
  if (type === "image") {
    return { blockId, type, alt: "", widthPercent: 100 };
  }
  if (type === "table") {
    return {
      blockId,
      type,
      caption: "",
      hasHeaderRow: true,
      hasHeaderColumn: false,
      rows: [
        ["Header 1", "Header 2"],
        ["", ""],
      ],
    };
  }
  return { blockId, type: "paragraph", text: "" };
}

export function AdminPageEditorForm({
  kb,
  page,
  parentOptions,
}: {
  kb: KnowledgeBase;
  page: KbPage;
  parentOptions: ParentOption[];
}) {
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [summary, setSummary] = useState(page.summary);
  const [visibility, setVisibility] = useState<PageVisibility>(page.visibility);
  const [parentPath, setParentPath] = useState(page.path.slice(0, -1).join("/"));
  const [ownerLabel, setOwnerLabel] = useState(page.ownerLabel);
  const [contactEmail, setContactEmail] = useState(page.contactEmail);
  const [lastReviewedDate, setLastReviewedDate] = useState(page.lastReviewedDate);
  const [blocks, setBlocks] = useState<ContentBlock[]>(page.blocks);
  const [busy, setBusy] = useState<EditableStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<PageStatus>(page.status);

  const previewUrl = useMemo(() => savedUrl ?? `/kb/${kb.slug}/${page.path.join("/")}`, [kb.slug, page.path, savedUrl]);

  function replaceBlock(index: number, nextBlock: ContentBlock) {
    setBlocks((current) => current.map((block, blockIndex) => (blockIndex === index ? nextBlock : block)));
  }

  function removeBlock(index: number) {
    setBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index));
  }

  function addBlock(type: AddableBlockType) {
    setBlocks((current) => [...current, newBlock(type)]);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setBlocks((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  async function submit(status: EditableStatus) {
    setBusy(status);
    setError(null);
    setIssues([]);
    setSavedUrl(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          summary,
          visibility,
          status,
          parentPath: parentPath ? parentPath.split("/") : [],
          sortOrder: page.sortOrder,
          ownerLabel,
          contactEmail,
          lastReviewedDate,
          blocks,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data.issues) && data.issues.length > 0) {
          setIssues(data.issues as string[]);
        }
        throw new Error(data.message ?? "Could not save the page.");
      }
      setSavedStatus(status);
      setSavedUrl(data.url ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the page.");
    } finally {
      setBusy(null);
    }
  }

  const actionButtons = (
    <div className="import-actions">
      <button
        className="button"
        disabled={busy !== null || !title || blocks.length === 0}
        onClick={() => submit("draft")}
        type="button"
      >
        {busy === "draft" ? "Saving..." : "Save draft"}
      </button>
      <button
        className="button"
        disabled={busy !== null || !title || blocks.length === 0}
        onClick={() => submit("published")}
        type="button"
      >
        {busy === "published" ? "Publishing..." : "Publish"}
      </button>
      <Link className="button button--ghost" href={previewUrl}>
        View current page
      </Link>
    </div>
  );

  return (
    <div className="editor-layout">
      <form className="form card editor-form" onSubmit={(event) => event.preventDefault()}>
        {error && <p className="error">{error}</p>}
        {issues.length > 0 && (
          <div className="error" role="alert">
            <strong>Publishing is blocked until these are fixed:</strong>
            <ul className="issue-list">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {savedUrl && (
          <p className="alert alert--success">
            Saved as <strong>{savedStatus}</strong>. <Link href={savedUrl}>View page</Link>
          </p>
        )}
        {actionButtons}

        <fieldset className="fieldset">
          <legend>Page Settings</legend>
          <label>
            <span className="meta">Title</span>
            <input className="input" onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label>
            <span className="meta">Slug</span>
            <input className="input" onChange={(event) => setSlug(event.target.value)} value={slug} />
          </label>
          <label>
            <span className="meta">Summary</span>
            <textarea
              className="input"
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              value={summary}
            />
          </label>
          <label>
            <span className="meta">Nest under</span>
            <select className="input" onChange={(event) => setParentPath(event.target.value)} value={parentPath}>
              <option value="">Top level</option>
              {parentOptions.map((option) => (
                <option key={option.path} value={option.path}>
                  {`${"  ".repeat(Math.max(0, option.depth - 1))}${option.title} (${option.status})`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="meta">Visibility</span>
            <select
              className="input"
              onChange={(event) => setVisibility(event.target.value === "staff" ? "staff" : "public")}
              value={visibility}
            >
              <option value="public">Public</option>
              <option value="staff">Staff only</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Governance</legend>
          <p className="meta">
            Required before publishing. Owner and contact are kept in admin metadata; the public page shows
            only the &ldquo;Updated on&rdquo; date.
          </p>
          <label>
            <span className="meta">Owner or office</span>
            <input
              className="input"
              onChange={(event) => setOwnerLabel(event.target.value)}
              placeholder="e.g. Graduate School Outreach and Technology"
              value={ownerLabel}
            />
          </label>
          <label>
            <span className="meta">Contact email</span>
            <input
              className="input"
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="name@wsu.edu"
              type="email"
              value={contactEmail}
            />
          </label>
          <label>
            <span className="meta">Last reviewed date</span>
            <input
              className="input"
              onChange={(event) => setLastReviewedDate(event.target.value)}
              type="date"
              value={lastReviewedDate}
            />
          </label>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Content Blocks</legend>
          {blocks.map((block, index) => (
            <BlockEditor
              block={block}
              canMoveDown={index < blocks.length - 1}
              canMoveUp={index > 0}
              index={index}
              key={block.blockId}
              kbId={kb.id}
              onChange={(nextBlock) => replaceBlock(index, nextBlock)}
              onMoveDown={() => moveBlock(index, 1)}
              onMoveUp={() => moveBlock(index, -1)}
              onRemove={() => removeBlock(index)}
            />
          ))}
          <div className="editor-toolbar" aria-label="Add content block">
            <button className="button button--ghost button--small" onClick={() => addBlock("paragraph")} type="button">
              Paragraph
            </button>
            <button className="button button--ghost button--small" onClick={() => addBlock("heading")} type="button">
              Heading
            </button>
            <button className="button button--ghost button--small" onClick={() => addBlock("list")} type="button">
              List
            </button>
            <button className="button button--ghost button--small" onClick={() => addBlock("table")} type="button">
              Table
            </button>
            <button className="button button--ghost button--small" onClick={() => addBlock("image")} type="button">
              Image
            </button>
            <button className="button button--ghost button--small" onClick={() => addBlock("alert")} type="button">
              Alert
            </button>
          </div>
        </fieldset>

        {actionButtons}
      </form>
    </div>
  );
}

function RichTextToolbar() {
  function apply(command: string, value?: string) {
    document.execCommand(command, false, value);
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.isContentEditable) {
      active.dispatchEvent(new InputEvent("input", { bubbles: true }));
      active.focus();
    }
  }

  function addLink() {
    const href = window.prompt("Link URL");
    if (!href) {
      return;
    }
    apply("createLink", href);
  }

  const buttonClass = "rich-text-toolbar__button";
  return (
    <div className="rich-text-toolbar" aria-label="Text formatting toolbar">
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => apply("bold")} type="button">
        B
      </button>
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => apply("italic")} type="button">
        I
      </button>
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => apply("underline")} type="button">
        U
      </button>
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => apply("strikeThrough")} type="button">
        S
      </button>
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => apply("superscript")} type="button">
        Sup
      </button>
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => apply("subscript")} type="button">
        Sub
      </button>
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={addLink} type="button">
        Link
      </button>
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => apply("unlink")} type="button">
        Unlink
      </button>
      <button className={buttonClass} onMouseDown={(event) => event.preventDefault()} onClick={() => apply("removeFormat")} type="button">
        Clear
      </button>
    </div>
  );
}

function RichTextEditable({
  className,
  element = "div",
  text,
  html,
  onChange,
}: {
  className?: string;
  element?: RichTextElement;
  text: string;
  html?: string;
  onChange: (html: string, text: string) => void;
}) {
  const Tag = element;
  const value = sanitizeRichText(html ?? textToRichText(text));

  return (
    <>
      <RichTextToolbar />
      <Tag
        className={className}
        contentEditable
        dangerouslySetInnerHTML={{ __html: value }}
        onBlur={(event) => {
          const cleanHtml = sanitizeRichText(event.currentTarget.innerHTML);
          if (event.currentTarget.innerHTML !== cleanHtml) {
            event.currentTarget.innerHTML = cleanHtml;
          }
          onChange(cleanHtml, richTextToPlainText(cleanHtml));
        }}
        suppressContentEditableWarning
      />
    </>
  );
}

function BlockEditor({
  block,
  canMoveDown,
  canMoveUp,
  index,
  kbId,
  onChange,
  onMoveDown,
  onMoveUp,
  onRemove,
}: {
  block: ContentBlock;
  canMoveDown: boolean;
  canMoveUp: boolean;
  index: number;
  kbId: string;
  onChange: (block: ContentBlock) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadImage(file: File | null) {
    if (!file || block.type !== "image") {
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kbId", kbId);
      formData.append("alt", block.alt ?? "");
      const response = await fetch("/api/admin/assets/images", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not upload image.");
      }
      onChange({
        ...block,
        assetId: data.asset?.id,
        url: data.url ?? block.url,
        alt: block.alt ?? data.alt ?? "",
      });
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : "Could not upload image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="block-editor">
      <div className="block-editor__header">
        <strong>
          {index + 1}. {block.type}
        </strong>
        <div className="block-editor__actions">
          <button className="button button--ghost button--small" disabled={!canMoveUp} onClick={onMoveUp} type="button">
            Up
          </button>
          <button className="button button--ghost button--small" disabled={!canMoveDown} onClick={onMoveDown} type="button">
            Down
          </button>
          <button className="button button--ghost button--small" onClick={onRemove} type="button">
            Remove
          </button>
        </div>
      </div>
      {block.type === "paragraph" && (
        <RichTextEditable
          className="wysiwyg-surface wysiwyg-paragraph"
          html={block.html}
          onChange={(html, text) => onChange({ ...block, html, text })}
          text={block.text}
        />
      )}
      {block.type === "heading" && (
        <>
          <label>
            <span className="meta">Level</span>
            <select
              className="input"
              onChange={(event) => onChange({ ...block, level: event.target.value === "3" ? 3 : 2 })}
              value={block.level}
            >
              <option value={2}>Heading 2</option>
              <option value={3}>Heading 3</option>
            </select>
          </label>
          {block.level === 2 ? (
            <RichTextEditable
              className="wysiwyg-surface"
              element="h2"
              html={block.html}
              onChange={(html, text) => onChange({ ...block, html, text })}
              text={block.text}
            />
          ) : (
            <RichTextEditable
              className="wysiwyg-surface"
              element="h3"
              html={block.html}
              onChange={(html, text) => onChange({ ...block, html, text })}
              text={block.text}
            />
          )}
        </>
      )}
      {block.type === "list" && (
        <>
          <label className="checkbox-row">
            <input
              checked={Boolean(block.ordered)}
              onChange={(event) => onChange({ ...block, ordered: event.target.checked })}
              type="checkbox"
            />
            Ordered list
          </label>
          <div className="list-item-editor-list">
            {block.items.map((item, itemIndex) => (
              <div className="list-item-editor" key={`${block.blockId}-${itemIndex}`}>
                <span className="list-item-editor__marker">{block.ordered ? `${itemIndex + 1}.` : "-"}</span>
                <div className="list-item-editor__body">
                  <RichTextEditable
                    className="wysiwyg-surface"
                    html={block.itemHtml?.[itemIndex]}
                    onChange={(html, text) => {
                      const items = [...block.items];
                      const itemHtml = [...(block.itemHtml ?? block.items.map((value) => textToRichText(value)))];
                      items[itemIndex] = text;
                      itemHtml[itemIndex] = html;
                      onChange({ ...block, items, itemHtml });
                    }}
                    text={item}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            className="button button--ghost button--small"
            onClick={() =>
              onChange({
                ...block,
                items: [...block.items, "New list item"],
                itemHtml: [...(block.itemHtml ?? block.items.map((value) => textToRichText(value))), "New list item"],
              })
            }
            type="button"
          >
            Add item
          </button>
        </>
      )}
      {block.type === "alert" && (
        <>
          <label>
            <span className="meta">Variant</span>
            <select
              className="input"
              onChange={(event) => onChange({ ...block, variant: event.target.value === "warning" ? "warning" : "info" })}
              value={block.variant}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
            </select>
          </label>
          <RichTextEditable
            className="alert wysiwyg-surface"
            html={block.html}
            onChange={(html, text) => onChange({ ...block, html, text })}
            text={block.text}
          />
        </>
      )}
      {block.type === "image" && (
        <>
          <div className="managed-image-tools">
            <label>
              <span className="meta">Managed image upload</span>
              <input
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                disabled={uploading}
                onChange={(event) => uploadImage(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            {uploading && <p className="meta">Uploading image...</p>}
            {uploadError && <p className="error">{uploadError}</p>}
          </div>
          <div className="field-row">
            <label>
              <span className="meta">Image URL or stable asset route</span>
              <input
                className="input"
                onChange={(event) => onChange({ ...block, url: event.target.value })}
                value={block.url ?? ""}
              />
            </label>
            <label>
              <span className="meta">Alt text</span>
              <input
                className="input"
                onChange={(event) => onChange({ ...block, alt: event.target.value })}
                value={block.alt ?? ""}
              />
            </label>
          </div>
          {block.assetId && <p className="meta">Managed asset: <code>{block.assetId}</code></p>}
          <label>
            <span className="meta">Display width: {block.widthPercent ?? 100}%</span>
            <input
              max={100}
              min={25}
              onChange={(event) => onChange({ ...block, widthPercent: Number(event.target.value) })}
              step={5}
              type="range"
              value={block.widthPercent ?? 100}
            />
          </label>
          {block.url && (
            <figure className="content-image content-image--editor" style={{ maxWidth: `${block.widthPercent ?? 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={block.alt ?? ""} src={block.url} />
            </figure>
          )}
        </>
      )}
      {block.type === "table" && <TableBlockEditor block={block} onChange={onChange} />}
      {block.type === "asset_link" && (
        <p className="meta">
          Managed asset link: <code>{block.assetId}</code>. Asset selection is handled by the future asset manager.
        </p>
      )}
    </section>
  );
}

function TableBlockEditor({
  block,
  onChange,
}: {
  block: Extract<ContentBlock, { type: "table" }>;
  onChange: (block: ContentBlock) => void;
}) {
  const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
  const normalizedRows = block.rows.length > 0 ? block.rows : [[""]];
  const normalizedRowsHtml = normalizedRows.map((row, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => {
      const html = block.rowsHtml?.[rowIndex]?.[columnIndex];
      return html ?? textToRichText(row[columnIndex] ?? "");
    }),
  );

  function updateCell(rowIndex: number, columnIndex: number, value: string, html: string) {
    const rows = normalizedRows.map((row, currentRowIndex) => {
      const nextRow = [...row];
      while (nextRow.length < columnCount) {
        nextRow.push("");
      }
      if (currentRowIndex === rowIndex) {
        nextRow[columnIndex] = value;
      }
      return nextRow;
    });
    const rowsHtml = normalizedRowsHtml.map((row) => [...row]);
    rowsHtml[rowIndex][columnIndex] = html;
    onChange({ ...block, rows, rowsHtml });
  }

  function addRow() {
    onChange({
      ...block,
      rows: [...normalizedRows, Array.from({ length: columnCount }, () => "")],
      rowsHtml: [...normalizedRowsHtml, Array.from({ length: columnCount }, () => "")],
    });
  }

  function removeRow() {
    if (normalizedRows.length <= 1) {
      return;
    }
    onChange({ ...block, rows: normalizedRows.slice(0, -1), rowsHtml: normalizedRowsHtml.slice(0, -1) });
  }

  function addColumn() {
    onChange({
      ...block,
      rows: normalizedRows.map((row) => [...row, ""]),
      rowsHtml: normalizedRowsHtml.map((row) => [...row, ""]),
    });
  }

  function removeColumn() {
    if (columnCount <= 1) {
      return;
    }
    onChange({
      ...block,
      rows: normalizedRows.map((row) => row.slice(0, -1)),
      rowsHtml: normalizedRowsHtml.map((row) => row.slice(0, -1)),
    });
  }

  return (
    <div className="table-editor">
      <label>
        <span className="meta">Caption</span>
        <input
          className="input"
          onChange={(event) => onChange({ ...block, caption: event.target.value })}
          value={block.caption ?? ""}
        />
      </label>
      <div className="checkbox-grid">
        <label className="checkbox-row">
          <input
            checked={block.hasHeaderRow}
            onChange={(event) => onChange({ ...block, hasHeaderRow: event.target.checked })}
            type="checkbox"
          />
          First row is headers
        </label>
        <label className="checkbox-row">
          <input
            checked={block.hasHeaderColumn}
            onChange={(event) => onChange({ ...block, hasHeaderColumn: event.target.checked })}
            type="checkbox"
          />
          First column is headers
        </label>
      </div>
      <div className="table-wrap">
        <table className="admin-table table-editor__table">
          <tbody>
            {normalizedRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td key={`${rowIndex}-${columnIndex}`}>
                    <RichTextEditable
                      className="wysiwyg-table-cell"
                      html={normalizedRowsHtml[rowIndex]?.[columnIndex]}
                      onChange={(html, text) => updateCell(rowIndex, columnIndex, text, html)}
                      text={row[columnIndex] ?? ""}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="editor-toolbar">
        <button className="button button--ghost button--small" onClick={addRow} type="button">
          Add row
        </button>
        <button className="button button--ghost button--small" disabled={normalizedRows.length <= 1} onClick={removeRow} type="button">
          Remove row
        </button>
        <button className="button button--ghost button--small" onClick={addColumn} type="button">
          Add column
        </button>
        <button className="button button--ghost button--small" disabled={columnCount <= 1} onClick={removeColumn} type="button">
          Remove column
        </button>
      </div>
    </div>
  );
}

"use client";

import { RichTextEditable } from "@/components/RichTextEditable";
import { textToRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

export function TableBlockEditor({
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
        <button
          className="button button--ghost button--small"
          disabled={normalizedRows.length <= 1}
          onClick={removeRow}
          type="button"
        >
          Remove row
        </button>
        <button className="button button--ghost button--small" onClick={addColumn} type="button">
          Add column
        </button>
        <button
          className="button button--ghost button--small"
          disabled={columnCount <= 1}
          onClick={removeColumn}
          type="button"
        >
          Remove column
        </button>
      </div>
    </div>
  );
}

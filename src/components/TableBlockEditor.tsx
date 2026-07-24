"use client";

import { RichTextEditable } from "@/components/RichTextEditable";
import { textToRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

type TableBlock = Extract<ContentBlock, { type: "table" }>;

function logicalWidth(row: string[], colSpans?: number[]): number {
  return row.reduce((sum, _cell, index) => sum + Math.max(1, colSpans?.[index] ?? 1), 0);
}

export function TableBlockEditor({
  block,
  onChange,
}: {
  block: TableBlock;
  onChange: (block: ContentBlock) => void;
}) {
  const normalizedRows = block.rows.length > 0 ? block.rows : [[""]];
  const columnCount = Math.max(
    1,
    ...normalizedRows.map((row, rowIndex) => logicalWidth(row, block.colSpans?.[rowIndex])),
  );
  const hasSpans = Boolean(
    block.colSpans?.some((row) => row.some((span) => span > 1)) ||
      block.rowSpans?.some((row) => row.some((span) => span > 1)) ||
      block.cellAligns?.some((row) => row.some((align) => align !== "left")),
  );

  function cellHtml(rowIndex: number, columnIndex: number, text: string) {
    return block.rowsHtml?.[rowIndex]?.[columnIndex] ?? textToRichText(text);
  }

  function withoutSpans(next: Partial<TableBlock>): TableBlock {
    const {
      colSpans: _colSpans,
      rowSpans: _rowSpans,
      cellAligns: _cellAligns,
      ...rest
    } = { ...block, ...next };
    return rest;
  }

  function updateCell(rowIndex: number, columnIndex: number, value: string, html: string) {
    const rows = normalizedRows.map((row, currentRowIndex) => {
      if (currentRowIndex !== rowIndex) {
        return [...row];
      }
      const nextRow = [...row];
      nextRow[columnIndex] = value;
      return nextRow;
    });
    const rowsHtml = normalizedRows.map((row, currentRowIndex) =>
      row.map((cell, currentColumnIndex) => {
        if (currentRowIndex === rowIndex && currentColumnIndex === columnIndex) {
          return html;
        }
        return cellHtml(currentRowIndex, currentColumnIndex, cell);
      }),
    );
    onChange({
      ...block,
      rows,
      rowsHtml,
      colSpans: block.colSpans,
      rowSpans: block.rowSpans,
      cellAligns: block.cellAligns,
    });
  }

  function addRow() {
    onChange(
      withoutSpans({
        rows: [...normalizedRows, Array.from({ length: columnCount }, () => "")],
        rowsHtml: [
          ...normalizedRows.map((row, rowIndex) =>
            Array.from({ length: columnCount }, (_, columnIndex) =>
              cellHtml(rowIndex, columnIndex, row[columnIndex] ?? ""),
            ),
          ),
          Array.from({ length: columnCount }, () => ""),
        ],
      }),
    );
  }

  function removeRow() {
    if (normalizedRows.length <= 1) {
      return;
    }
    onChange(
      withoutSpans({
        rows: normalizedRows.slice(0, -1),
        rowsHtml: normalizedRows.slice(0, -1).map((row, rowIndex) =>
          Array.from({ length: columnCount }, (_, columnIndex) =>
            cellHtml(rowIndex, columnIndex, row[columnIndex] ?? ""),
          ),
        ),
      }),
    );
  }

  function addColumn() {
    onChange(
      withoutSpans({
        rows: normalizedRows.map((row) => {
          const next = [...row];
          while (next.length < columnCount) {
            next.push("");
          }
          next.push("");
          return next;
        }),
        rowsHtml: normalizedRows.map((row, rowIndex) => {
          const next = Array.from({ length: columnCount }, (_, columnIndex) =>
            cellHtml(rowIndex, columnIndex, row[columnIndex] ?? ""),
          );
          next.push("");
          return next;
        }),
      }),
    );
  }

  function removeColumn() {
    if (columnCount <= 1) {
      return;
    }
    onChange(
      withoutSpans({
        rows: normalizedRows.map((row) => {
          const next = [...row];
          while (next.length < columnCount) {
            next.push("");
          }
          return next.slice(0, -1);
        }),
        rowsHtml: normalizedRows.map((row, rowIndex) =>
          Array.from({ length: columnCount }, (_, columnIndex) =>
            cellHtml(rowIndex, columnIndex, row[columnIndex] ?? ""),
          ).slice(0, -1),
        ),
      }),
    );
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
      {hasSpans && (
        <p className="meta">
          This table keeps merged cells and alignment from its source. Cell text is editable; adding
          or removing rows/columns clears those source layouts.
        </p>
      )}
      <div className="table-wrap">
        <table className="admin-table table-editor__table">
          <tbody>
            {normalizedRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, columnIndex) => {
                  const colSpan = block.colSpans?.[rowIndex]?.[columnIndex] ?? 1;
                  const rowSpan = block.rowSpans?.[rowIndex]?.[columnIndex] ?? 1;
                  const align = block.cellAligns?.[rowIndex]?.[columnIndex];
                  return (
                    <td
                      colSpan={colSpan > 1 ? colSpan : undefined}
                      key={`${rowIndex}-${columnIndex}`}
                      rowSpan={rowSpan > 1 ? rowSpan : undefined}
                      style={align && align !== "left" ? { textAlign: align } : undefined}
                    >
                      <RichTextEditable
                        className="wysiwyg-table-cell"
                        html={cellHtml(rowIndex, columnIndex, cell)}
                        onChange={(html, text) => updateCell(rowIndex, columnIndex, text, html)}
                        text={cell}
                      />
                    </td>
                  );
                })}
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

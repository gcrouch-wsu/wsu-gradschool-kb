"use client";

import { useState } from "react";
import { LexicalTableCellSurface } from "@/components/LexicalTableCellSurface";
import { textToRichText } from "@/lib/rich-text";
import type { ContentBlock } from "@/lib/types";

type TableBlock = Extract<ContentBlock, { type: "table" }>;

function logicalWidth(row: string[], colSpans?: number[]): number {
  return row.reduce((sum, _cell, index) => sum + Math.max(1, colSpans?.[index] ?? 1), 0);
}

export function TableBlockEditor({
  block,
  kbId,
  onChange,
}: {
  block: TableBlock;
  kbId: string;
  onChange: (block: ContentBlock) => void;
}) {
  const [selectedCell, setSelectedCell] = useState({ rowIndex: 0, columnIndex: 0 });
  const [structureEpoch, setStructureEpoch] = useState(0);
  const normalizedRows = block.rows.length > 0 ? block.rows : [[""]];
  const columnCount = Math.max(
    1,
    ...normalizedRows.map((row, rowIndex) => logicalWidth(row, block.colSpans?.[rowIndex])),
  );
  const selectedRowIndex = Math.min(selectedCell.rowIndex, normalizedRows.length - 1);
  const selectedColumnIndex = Math.min(selectedCell.columnIndex, columnCount - 1);
  const hasSpans = Boolean(
    block.colSpans?.some((row) => row.some((span) => span > 1)) ||
      block.rowSpans?.some((row) => row.some((span) => span > 1)) ||
      block.cellAligns?.some((row) => row.some((align) => align !== "left")),
  );

  function cellHtml(rowIndex: number, columnIndex: number, text: string) {
    return block.rowsHtml?.[rowIndex]?.[columnIndex] ?? textToRichText(text);
  }

  function tableRows() {
    return normalizedRows.map((row) => Array.from({ length: columnCount }, (_, columnIndex) => row[columnIndex] ?? ""));
  }

  function tableRowsHtml() {
    return normalizedRows.map((row, rowIndex) =>
      Array.from({ length: columnCount }, (_, columnIndex) =>
        cellHtml(rowIndex, columnIndex, row[columnIndex] ?? ""),
      ),
    );
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

  function emitStructureChange(next: Partial<TableBlock>, nextSelectedCell = selectedCell) {
    setSelectedCell(nextSelectedCell);
    setStructureEpoch((value) => value + 1);
    onChange(withoutSpans(next));
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
    emitStructureChange(
      {
        rows: [...tableRows(), Array.from({ length: columnCount }, () => "")],
        rowsHtml: [...tableRowsHtml(), Array.from({ length: columnCount }, () => "")],
      },
      { rowIndex: normalizedRows.length, columnIndex: selectedColumnIndex },
    );
  }

  function removeRow() {
    if (normalizedRows.length <= 1) {
      return;
    }
    const rows = tableRows();
    const rowsHtml = tableRowsHtml();
    rows.splice(selectedRowIndex, 1);
    rowsHtml.splice(selectedRowIndex, 1);
    emitStructureChange(
      {
        rows,
        rowsHtml,
      },
      { rowIndex: Math.max(0, Math.min(selectedRowIndex, rows.length - 1)), columnIndex: selectedColumnIndex },
    );
  }

  function addColumn() {
    emitStructureChange(
      {
        rows: tableRows().map((row) => [...row, ""]),
        rowsHtml: tableRowsHtml().map((row) => [...row, ""]),
      },
      { rowIndex: selectedRowIndex, columnIndex: columnCount },
    );
  }

  function removeColumn() {
    if (columnCount <= 1) {
      return;
    }
    const rows = tableRows().map((row) => {
      const next = [...row];
      next.splice(selectedColumnIndex, 1);
      return next;
    });
    const rowsHtml = tableRowsHtml().map((row) => {
      const next = [...row];
      next.splice(selectedColumnIndex, 1);
      return next;
    });
    emitStructureChange(
      {
        rows,
        rowsHtml,
      },
      { rowIndex: selectedRowIndex, columnIndex: Math.max(0, Math.min(selectedColumnIndex, columnCount - 2)) },
    );
  }

  function moveRow(direction: -1 | 1) {
    const targetIndex = selectedRowIndex + direction;
    if (targetIndex < 0 || targetIndex >= normalizedRows.length) {
      return;
    }
    const rows = tableRows();
    const rowsHtml = tableRowsHtml();
    [rows[selectedRowIndex], rows[targetIndex]] = [rows[targetIndex], rows[selectedRowIndex]];
    [rowsHtml[selectedRowIndex], rowsHtml[targetIndex]] = [rowsHtml[targetIndex], rowsHtml[selectedRowIndex]];
    emitStructureChange(
      {
        rows,
        rowsHtml,
      },
      { rowIndex: targetIndex, columnIndex: selectedColumnIndex },
    );
  }

  function moveColumn(direction: -1 | 1) {
    const targetIndex = selectedColumnIndex + direction;
    if (targetIndex < 0 || targetIndex >= columnCount) {
      return;
    }
    const rows = tableRows().map((row) => {
      const next = [...row];
      [next[selectedColumnIndex], next[targetIndex]] = [next[targetIndex], next[selectedColumnIndex]];
      return next;
    });
    const rowsHtml = tableRowsHtml().map((row) => {
      const next = [...row];
      [next[selectedColumnIndex], next[targetIndex]] = [next[targetIndex], next[selectedColumnIndex]];
      return next;
    });
    emitStructureChange(
      {
        rows,
        rowsHtml,
      },
      { rowIndex: selectedRowIndex, columnIndex: targetIndex },
    );
  }

  const renderRows = hasSpans ? normalizedRows : tableRows();

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
          This table keeps merged cells and alignment from its source. Cell text is editable; changing
          rows/columns clears those source layouts.
        </p>
      )}
      <div className="table-wrap">
        <table className="admin-table table-editor__table">
          <tbody>
            {renderRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, columnIndex) => {
                  const colSpan = block.colSpans?.[rowIndex]?.[columnIndex] ?? 1;
                  const rowSpan = block.rowSpans?.[rowIndex]?.[columnIndex] ?? 1;
                  const align = block.cellAligns?.[rowIndex]?.[columnIndex];
                  return (
                    <td
                      colSpan={colSpan > 1 ? colSpan : undefined}
                      key={`${structureEpoch}-${rowIndex}-${columnIndex}`}
                      rowSpan={rowSpan > 1 ? rowSpan : undefined}
                      style={align && align !== "left" ? { textAlign: align } : undefined}
                    >
                      <LexicalTableCellSurface
                        initialHtml={cellHtml(rowIndex, columnIndex, cell)}
                        kbId={kbId}
                        onChange={(html, text) => updateCell(rowIndex, columnIndex, text, html)}
                        onFocus={() => setSelectedCell({ rowIndex, columnIndex })}
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
        <button
          aria-label="Move selected row up"
          className="button button--ghost button--small"
          disabled={selectedRowIndex <= 0}
          onClick={() => moveRow(-1)}
          type="button"
        >
          Row up
        </button>
        <button
          aria-label="Move selected row down"
          className="button button--ghost button--small"
          disabled={selectedRowIndex >= normalizedRows.length - 1}
          onClick={() => moveRow(1)}
          type="button"
        >
          Row down
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
        <button
          aria-label="Move selected column left"
          className="button button--ghost button--small"
          disabled={selectedColumnIndex <= 0}
          onClick={() => moveColumn(-1)}
          type="button"
        >
          Column left
        </button>
        <button
          aria-label="Move selected column right"
          className="button button--ghost button--small"
          disabled={selectedColumnIndex >= columnCount - 1}
          onClick={() => moveColumn(1)}
          type="button"
        >
          Column right
        </button>
      </div>
    </div>
  );
}

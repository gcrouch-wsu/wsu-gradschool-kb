"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { DropdownSelect } from "@/components/DropdownSelect";

export type AdminDataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "center" | "right";
  width?: string;
};

export type AdminDataTableProps<T> = {
  rows: T[];
  columns: AdminDataTableColumn<T>[];
  getRowId: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyMessage?: string;
  actionsColumn?: {
    header?: string;
    cell: (row: T) => ReactNode;
  };
  toolbarExtra?: ReactNode;
};

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50];

export function AdminDataTable<T>({
  rows,
  columns,
  getRowId,
  searchPlaceholder = "Search…",
  searchFilter,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  emptyMessage = "No results match your search.",
  actionsColumn,
  toolbarExtra,
}: AdminDataTableProps<T>) {
  const searchFieldId = useId();
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let nextRows = rows;
    if (normalizedQuery && searchFilter) {
      nextRows = nextRows.filter((row) => searchFilter(row, normalizedQuery));
    }
    return nextRows;
  }, [query, rows, searchFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, rows.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);
  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + pageSize, filtered.length);

  return (
    <section className="admin-data-table">
      <div className="admin-data-table__toolbar">
        <label className="admin-data-table__search" htmlFor={searchFieldId}>
          <Search aria-hidden className="admin-data-table__search-icon" size={16} strokeWidth={1.75} />
          <span className="sr-only">Search table</span>
          <input
            className="input"
            id={searchFieldId}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            type="search"
            value={query}
          />
        </label>
        {toolbarExtra}
        <div className="admin-data-table__page-size">
          <DropdownSelect
            label="Rows per page"
            onChange={(value) => setPageSize(Number(value))}
            options={pageSizeOptions.map((option) => ({
              label: String(option),
              value: String(option),
            }))}
            searchable={false}
            value={String(pageSize)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="meta admin-data-table__empty">{emptyMessage}</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.id} scope="col" style={{ textAlign: column.align ?? "left", width: column.width }}>
                    {column.header}
                  </th>
                ))}
                {actionsColumn && (
                  <th className="admin-data-table__actions-head" scope="col">
                    {actionsColumn.header ?? "Actions"}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={getRowId(row)}>
                  {columns.map((column) => (
                    <td key={column.id} style={{ textAlign: column.align ?? "left" }}>
                      {column.cell(row)}
                    </td>
                  ))}
                  {actionsColumn && (
                    <td className="admin-data-table__actions-cell">{actionsColumn.cell(row)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-data-table__footer meta">
        <p className="admin-data-table__summary">
          Showing {rangeStart}–{rangeEnd} of {filtered.length}
          {filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ""}
        </p>
        <div className="admin-data-table__pagination">
          <button
            aria-label="Previous page"
            className="button button--small button--ghost admin-data-table__page-btn"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden size={16} strokeWidth={1.75} />
          </button>
          <span className="admin-data-table__page-label">
            Page {page} of {totalPages}
          </span>
          <button
            aria-label="Next page"
            className="button button--small button--ghost admin-data-table__page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            type="button"
          >
            <ChevronRight aria-hidden size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </section>
  );
}

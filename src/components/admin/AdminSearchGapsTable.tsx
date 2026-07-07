"use client";

import { AdminDataTable } from "@/components/admin/AdminDataTable";

export type SearchGapRow = {
  term: string;
  count: number;
};

function searchGapFilter(row: SearchGapRow, query: string) {
  return row.term.toLowerCase().includes(query);
}

export function AdminSearchGapsTable({ gaps }: { gaps: SearchGapRow[] }) {
  return (
    <AdminDataTable
      columns={[
        {
          id: "term",
          header: "Search Term",
          cell: (row) => <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>{row.term}</span>,
        },
        {
          id: "count",
          header: "Failed Search Count",
          cell: (row) => row.count,
        },
      ]}
      emptyMessage="No zero-result searches recorded in the audit retention window."
      getRowId={(row) => row.term}
      rows={gaps}
      searchFilter={searchGapFilter}
      searchPlaceholder="Search terms…"
    />
  );
}

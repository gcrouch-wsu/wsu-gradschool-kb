"use client";

import { AdminDataTable } from "@/components/admin/AdminDataTable";
import type { AuditLogEntry } from "@/lib/types";

function auditSearchFilter(event: AuditLogEntry, query: string) {
  return (
    event.actorEmail.toLowerCase().includes(query) ||
    event.action.toLowerCase().includes(query) ||
    event.entityLabel.toLowerCase().includes(query) ||
    event.entityType.toLowerCase().includes(query) ||
    JSON.stringify(event.details).toLowerCase().includes(query)
  );
}

export function AdminAuditEventsTable({ events }: { events: AuditLogEntry[] }) {
  return (
    <AdminDataTable
      columns={[
        {
          id: "when",
          header: "When",
          cell: (event) => new Date(event.createdAt).toLocaleString(),
        },
        {
          id: "actor",
          header: "Actor",
          cell: (event) => (
            <>
              {event.actorEmail}
              <div className="meta">{event.actorRole}</div>
            </>
          ),
        },
        {
          id: "action",
          header: "Action",
          cell: (event) => event.action,
        },
        {
          id: "item",
          header: "Item",
          cell: (event) => (
            <>
              {event.entityLabel || event.entityId}
              <div className="meta">{event.entityType}</div>
            </>
          ),
        },
        {
          id: "details",
          header: "Details",
          cell: (event) => <code>{JSON.stringify(event.details)}</code>,
        },
      ]}
      emptyMessage="No audit events match these filters."
      getRowId={(event) => event.id}
      rows={events}
      searchFilter={auditSearchFilter}
      searchPlaceholder="Search actor, action, or item…"
    />
  );
}

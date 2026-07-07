"use client";

import Link from "next/link";
import { useState } from "react";
import { DropdownSelect } from "@/components/DropdownSelect";

type AuditFilterValues = {
  q: string;
  action: string;
  entityType: string;
  kbId: string;
  from: string;
  to: string;
};

type AuditKbOption = {
  id: string;
  title: string;
};

const ENTITY_TYPE_OPTIONS = [
  { label: "Any", value: "" },
  { label: "Page", value: "page" },
  { label: "Asset", value: "asset" },
  { label: "Knowledge base", value: "kb" },
  { label: "Import", value: "import" },
  { label: "Redirect", value: "redirect" },
  { label: "User", value: "user" },
  { label: "Settings", value: "settings" },
];

export function AdminAuditFilters({ filter, kbs }: { filter: AuditFilterValues; kbs: AuditKbOption[] }) {
  const [entityType, setEntityType] = useState(filter.entityType);
  const [kbId, setKbId] = useState(filter.kbId);

  const kbOptions = [
    { label: "Any", value: "" },
    ...kbs.map((kb) => ({
      label: kb.title,
      value: kb.id,
    })),
  ];

  return (
    <form className="form card audit-filter" method="get">
      <div className="field-row">
        <label>
          <span className="meta">Search</span>
          <input className="input" defaultValue={filter.q} name="q" placeholder="Actor, action, or item" />
        </label>
        <label>
          <span className="meta">Action</span>
          <input className="input" defaultValue={filter.action} name="action" placeholder="page.updated" />
        </label>
      </div>
      <div className="field-row">
        <div style={{ flex: 1 }}>
          <DropdownSelect
            label="Entity type"
            onChange={setEntityType}
            options={ENTITY_TYPE_OPTIONS}
            searchable={false}
            value={entityType}
          />
          <input name="entityType" type="hidden" value={entityType} />
        </div>
        <div style={{ flex: 1 }}>
          <DropdownSelect
            label="Knowledge base"
            onChange={setKbId}
            options={kbOptions}
            searchable={false}
            value={kbId}
          />
          <input name="kbId" type="hidden" value={kbId} />
        </div>
      </div>
      <div className="field-row">
        <label>
          <span className="meta">From</span>
          <input className="input" defaultValue={filter.from} name="from" type="date" />
        </label>
        <label>
          <span className="meta">To</span>
          <input className="input" defaultValue={filter.to} name="to" type="date" />
        </label>
      </div>
      <div className="admin-actions">
        <button className="button" type="submit">
          Apply filters
        </button>
        <Link className="button button--ghost" href="/admin/audit">
          Clear
        </Link>
      </div>
    </form>
  );
}

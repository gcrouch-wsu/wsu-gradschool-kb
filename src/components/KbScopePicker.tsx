"use client";

import { BookOpen } from "lucide-react";
import { DropdownSelect } from "@/components/DropdownSelect";

export interface KbScopeOption {
  id: string;
  slug: string;
  title: string;
}

interface KbScopePickerProps {
  kbs: KbScopeOption[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
}

export function KbScopePicker({ kbs, selectedSlug, onSelect }: KbScopePickerProps) {
  const selectedKb = kbs.find((kb) => kb.slug === selectedSlug) ?? kbs[0];

  if (!selectedKb) {
    return null;
  }

  const searchPlaceholder =
    kbs.length === 1
      ? "Search 1 knowledge base…"
      : `Search ${kbs.length} knowledge bases…`;

  return (
    <DropdownSelect
      label="Knowledge base"
      onChange={onSelect}
      options={kbs.map((kb) => ({
        icon: <BookOpen aria-hidden size={18} strokeWidth={1.75} />,
        label: kb.title,
        searchText: kb.slug,
        value: kb.slug,
      }))}
      searchLabel="Search knowledge bases"
      searchPlaceholder={searchPlaceholder}
      value={selectedKb.slug}
    />
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const HOME_KB_PAGE_SIZE = 2;

type KbListPaginationProps = {
  currentPage: number;
  totalItems: number;
  totalPages: number;
};

function pageHref(page: number) {
  return page <= 1 ? "/" : `/?kbPage=${page}`;
}

export function KbListPagination({ currentPage, totalItems, totalPages }: KbListPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const rangeStart = (currentPage - 1) * HOME_KB_PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * HOME_KB_PAGE_SIZE, totalItems);

  return (
    <nav aria-label="Knowledge base pages" className="kb-list__footer">
      <p className="kb-list__summary meta">
        Showing {rangeStart}–{rangeEnd} of {totalItems}
      </p>
      <div className="kb-list__pagination">
        {currentPage <= 1 ? (
          <span aria-disabled="true" className="kb-list__page-btn is-disabled">
            <ChevronLeft aria-hidden size={16} strokeWidth={1.75} />
            <span className="sr-only">Previous page</span>
          </span>
        ) : (
          <Link aria-label="Previous page" className="kb-list__page-btn" href={pageHref(currentPage - 1)}>
            <ChevronLeft aria-hidden size={16} strokeWidth={1.75} />
          </Link>
        )}
        <span className="kb-list__page-label meta">
          Page {currentPage} of {totalPages}
        </span>
        {currentPage >= totalPages ? (
          <span aria-disabled="true" className="kb-list__page-btn is-disabled">
            <ChevronRight aria-hidden size={16} strokeWidth={1.75} />
            <span className="sr-only">Next page</span>
          </span>
        ) : (
          <Link aria-label="Next page" className="kb-list__page-btn" href={pageHref(currentPage + 1)}>
            <ChevronRight aria-hidden size={16} strokeWidth={1.75} />
          </Link>
        )}
      </div>
    </nav>
  );
}

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const btnBase =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm transition disabled:cursor-not-allowed disabled:opacity-30';
  const btnNormal = `${btnBase} text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800`;

  // Generate visible page numbers (max 5 centered around current)
  const pages: number[] = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {totalItems === 0 ? 'Tidak ada data' : `${from}–${to} dari ${totalItems}`}
        </span>
        {onPageSizeChange && (
          <>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} / halaman
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onPageChange(1)}
            className={btnNormal}
            title="Halaman pertama"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onPageChange(currentPage - 1)}
            className={btnNormal}
            title="Sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {start > 1 && <span className="px-1 text-xs text-slate-400">…</span>}

          {pages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`${btnBase} ${
                p === currentPage
                  ? 'bg-brand-600 font-bold text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {p}
            </button>
          ))}

          {end < totalPages && <span className="px-1 text-xs text-slate-400">…</span>}

          <button
            type="button"
            disabled={!canNext}
            onClick={() => onPageChange(currentPage + 1)}
            className={btnNormal}
            title="Berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onPageChange(totalPages)}
            className={btnNormal}
            title="Halaman terakhir"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Helper hook-like function: slice data for current page */
export function paginateData<T>(data: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return data.slice(start, start + pageSize);
}

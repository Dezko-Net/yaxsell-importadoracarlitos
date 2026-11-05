'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;       // 1-based
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  pageSize?: number;
  totalItems?: number;
  className?: string;
}

export default function EpicPagination({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
  pageSize,
  totalItems,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build visible page numbers with ellipsis
  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [];
    pages.push(1);
    if (currentPage > 4) pages.push('...');
    const start = Math.max(2, currentPage - 2);
    const end = Math.min(totalPages - 1, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 3) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const pages = getPages();
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const startItem = pageSize ? (currentPage - 1) * pageSize + 1 : null;
  const endItem = pageSize && totalItems ? Math.min(currentPage * pageSize, totalItems) : null;

  return (
    <div className={`flex flex-col items-center gap-3 py-4 ${className}`}>
      {/* Item range info */}
      {startItem && endItem && totalItems && (
        <p className="text-xs text-gray-400 font-medium">
          Mostrando <span className="text-gray-700 font-semibold">{startItem}–{endItem}</span>{' '}
          de <span className="text-gray-700 font-semibold">{totalItems}</span> resultados
        </p>
      )}

      {/* Pagination controls */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* First */}
        <button
          onClick={() => onPageChange(1)}
          disabled={!canPrev || isLoading}
          title="Primera página"
          className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          <ChevronsLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>

        {/* Prev */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canPrev || isLoading}
          title="Página anterior"
          className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          <ChevronLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {pages.map((page, idx) =>
            page === '...' ? (
              <span
                key={`ellipsis-${idx}`}
                className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-gray-400 text-sm"
              >
                …
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page as number)}
                disabled={isLoading}
                className={`
                  min-w-[2.25rem] sm:min-w-[2rem] h-9 sm:h-8 px-2 flex items-center justify-center rounded-xl text-sm font-bold transition-all duration-150
                  ${currentPage === page
                    ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200 scale-105 border-0'
                    : 'border border-gray-200 text-gray-600 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed'
                  }
                `}
              >
                {isLoading && currentPage === page ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  page
                )}
              </button>
            )
          )}
        </div>

        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canNext || isLoading}
          title="Página siguiente"
          className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          <ChevronRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>

        {/* Last */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={!canNext || isLoading}
          title="Última página"
          className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          <ChevronsRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>

      {/* Page counter pill */}
      <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-full">
        <span className="text-xs text-gray-400">Página</span>
        <span className="text-xs font-bold text-indigo-600">{currentPage}</span>
        <span className="text-xs text-gray-300">/</span>
        <span className="text-xs font-bold text-gray-700">{totalPages}</span>
      </div>
    </div>
  );
}

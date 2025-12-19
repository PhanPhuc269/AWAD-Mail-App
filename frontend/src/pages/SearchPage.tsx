import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import SearchBar from "@/components/search/SearchBar";
import SearchResultsView from "@/components/search/SearchResultsView";
import { emailService } from "@/services/email.service";

const ITEMS_PER_PAGE = 20;

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery = searchParams.get("q") || "";
  const initialPage = Number(searchParams.get("page") || "1");

  const [query, setQuery] = useState(initialQuery);
  const [searchQuery, setSearchQuery] = useState(initialQuery); // Debounced query for actual search
  const [currentPage, setCurrentPage] = useState(
    initialPage > 0 ? initialPage : 1
  );

  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  // Debounce search query - only search after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(query);
      setCurrentPage(1); // Reset to page 1 when query changes
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    // Sync URL params when searchQuery/page change (not query, to avoid URL spam)
    const params: Record<string, string> = {};
    if (searchQuery) params.q = searchQuery;
    if (currentPage > 1) params.page = String(currentPage);
    setSearchParams(params, { replace: true });
  }, [searchQuery, currentPage, setSearchParams]);

  // Fetch search results with pagination (use searchQuery, not query)
  const { data, isLoading, error } = useQuery({
    queryKey: ["searchEmails", searchQuery, ITEMS_PER_PAGE, offset],
    queryFn: () =>
      emailService.fuzzySearch(searchQuery, ITEMS_PER_PAGE, offset),
    enabled: searchQuery.trim().length > 0,
  });

  const total = data?.total ?? 0;
  const totalPages =
    total > 0 ? Math.ceil(total / ITEMS_PER_PAGE) : 0;

  const handleSearch = (value: string) => {
    const trimmed = value.trim();
    setQuery(trimmed);
    // searchQuery will update via debounce effect
  };

  const handleSearchChange = (value: string) => {
    // Update query as user types (for controlled component)
    // Actual search will happen after debounce
    setQuery(value);
  };

  const handleClear = () => {
    setQuery("");
    setCurrentPage(1);
    setSearchParams({}, { replace: true });
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleEmailClick = (emailId: string) => {
    // Open email in inbox view
    navigate(`/inbox/${emailId}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (totalPages && newPage > totalPages)) return;
    setCurrentPage(newPage);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Header with search bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111418]">
        <button
          onClick={handleBack}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
            arrow_back
          </span>
        </button>
        <div className="flex-1">
          <SearchBar
            value={query}
            onChange={handleSearchChange}
            onSearch={handleSearch}
            onClear={handleClear}
            isSearching={isLoading}
            placeholder="Tìm kiếm email (hỗ trợ fuzzy)..."
            className="w-full"
            enableSuggestions={true}
          />
        </div>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-hidden">
        <SearchResultsView
          query={searchQuery}
          results={data?.emails || []}
          isLoading={isLoading}
          error={error ? "Không thể tìm kiếm. Vui lòng thử lại." : null}
          onBack={handleBack}
          onEmailClick={handleEmailClick}
        />
      </div>

      {/* Pagination footer */}
      {searchQuery && total > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111418] text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between">
          <span>
            {offset + 1}-{Math.min(offset + ITEMS_PER_PAGE, total)} của {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <span className="material-symbols-outlined text-lg">
                chevron_left
              </span>
            </button>
            <span className="px-1">
              {currentPage}/{totalPages || 1}
            </span>
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={totalPages === 0 || currentPage >= totalPages}
            >
              <span className="material-symbols-outlined text-lg">
                chevron_right
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



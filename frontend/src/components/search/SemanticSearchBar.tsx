import { useState, useEffect, useRef } from "react";
import { Search, X, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { emailService } from "@/services/email.service";

interface SemanticSearchBarProps {
  placeholder?: string;
  className?: string;
  enableSuggestions?: boolean;
}

export default function SemanticSearchBar({
  placeholder = "Tìm kiếm email...",
  className,
  enableSuggestions = true,
}: SemanticSearchBarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions when query changes (debounced)
  useEffect(() => {
    if (!enableSuggestions || query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await emailService.getSearchSuggestions(query, 5);
        setSuggestions(response.suggestions || []);
        setShowSuggestions(response.suggestions && response.suggestions.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query, enableSuggestions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    try {
      // Navigate to search page with fuzzy search (not semantic)
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleClear = () => {
    setQuery("");
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSuggestions(false);
      handleClear();
    } else if (enableSuggestions && showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        handleSuggestionSelect(suggestions[selectedIndex]);
      }
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    // Use fuzzy search when suggestion is selected
    navigate(`/search?q=${encodeURIComponent(suggestion)}`);
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
      }
    }, 200);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "relative flex items-center w-full",
        className
      )}
    >
      <div className="relative flex-1 max-w-xl">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
          <Search className="h-4 w-4 text-gray-400" />
          <Sparkles className="h-3 w-3 text-blue-500" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={isSearching}
          className={cn(
            "w-full pl-16 pr-10 py-2.5 rounded-full",
            "bg-gray-100 dark:bg-gray-800",
            "border border-transparent",
            "focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900",
            "text-sm text-gray-900 dark:text-white",
            "placeholder:text-gray-500 dark:placeholder:text-gray-400",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-blue-500/20",
            "shadow-sm hover:shadow-md"
          )}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 z-10 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        )}
        
        {/* Suggestions Dropdown */}
        {enableSuggestions && showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionSelect(suggestion)}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-2",
                  selectedIndex === index && "bg-blue-50 dark:bg-blue-900/20"
                )}
              >
                <Search className="h-3.5 w-3.5 text-gray-400" />
                <span className="flex-1">{suggestion}</span>
                <Sparkles className="h-3 w-3 text-blue-500" />
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}


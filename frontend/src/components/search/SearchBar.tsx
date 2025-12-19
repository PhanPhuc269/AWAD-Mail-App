import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { emailService } from "@/services/email.service";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching?: boolean;
  placeholder?: string;
  className?: string;
  value?: string; // Controlled value - if provided, displays this value
  onChange?: (value: string) => void; // Optional onChange callback for controlled mode
  enableSuggestions?: boolean; // Enable auto-suggestions
}

export default function SearchBar({
  onSearch,
  onClear,
  isSearching = false,
  placeholder = "Tìm kiếm email...",
  className,
  value: controlledValue,
  onChange,
  enableSuggestions = false,
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(controlledValue || "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Sync internal state when controlled value changes from outside (not from user input)
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalQuery(controlledValue);
    }
  }, [controlledValue]);

  // Use controlled value if provided, otherwise use internal state
  const query = controlledValue !== undefined ? controlledValue : internalQuery;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalQuery(newValue);
    // If onChange callback provided, notify parent (for controlled mode)
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleClear = () => {
    setInternalQuery("");
    onClear();
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
    setInternalQuery(suggestion);
    if (onChange) {
      onChange(suggestion);
    }
    setShowSuggestions(false);
    onSearch(suggestion.trim());
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
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
        "relative flex items-center",
        className
      )}
    >
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
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
            "w-full pl-10 pr-10 py-2 rounded-full",
            "bg-gray-100 dark:bg-gray-800",
            "border border-transparent",
            "focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900",
            "text-sm text-gray-900 dark:text-white",
            "placeholder:text-gray-500 dark:placeholder:text-gray-400",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          )}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 z-10"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        )}
        
        {/* Suggestions Dropdown */}
        {enableSuggestions && showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSuggestionSelect(suggestion)}
                className={cn(
                  "w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                  selectedIndex === index && "bg-blue-50 dark:bg-blue-900/20"
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

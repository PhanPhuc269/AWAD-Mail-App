import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { getAccessToken } from "@/lib/api-client";
import type { Email } from "@/types/email";
import MailboxList from "@/components/inbox/MailboxList";
import EmailList from "@/components/inbox/EmailList";
import EmailDetail from "@/components/inbox/EmailDetail";
import ComposeEmail from "@/components/inbox/ComposeEmail";
import SemanticSearchBar from "@/components/search/SemanticSearchBar";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config/api";
import KanbanToggle from "@/components/kanban/KanbanToggle";

export default function InboxPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);
  const { mailbox, emailId } = useParams<{
    mailbox?: string;
    emailId?: string;
  }>();

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitialData, setComposeInitialData] = useState({
    to: [] as string[],
    cc: [] as string[],
    subject: "",
    body: "",
    quotedContent: "",
    quotedHeader: "",
  });
  const [mobileView, setMobileView] = useState<"mailbox" | "list" | "detail">(
    "list"
  );
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      const initialTheme = (savedTheme as "light" | "dark") || systemTheme;

      // Apply theme immediately on mount
      if (initialTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }

      return initialTheme;
    }
    return "light";
  });

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Use URL params or default to 'inbox'
  const selectedMailboxId = mailbox || "inbox";
  const selectedEmailId = emailId || null;


  useEffect(() => {
    if (user) {
      // Start watching for email updates
      // Watch mailbox for updates
      // Note: watchMailbox is triggered elsewhere (e.g., login), so we only manage SSE here.

      // Connect to SSE
      const token = getAccessToken();
      const eventSource = new EventSource(
        `${API_BASE_URL}/events?token=${token}`,
        {
          withCredentials: true,
        }
      );

      let lastMutationTime = 0;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "email_update") {
            console.log("Received email update:", data.payload);

            // Ignore SSE updates for 3 seconds after user actions to prevent conflicts
            const timeSinceLastMutation = Date.now() - lastMutationTime;
            if (timeSinceLastMutation < 3000) {
              console.log("Ignoring SSE update - recent user action");
              return;
            }

            // Only invalidate for new emails or external changes
            queryClient.invalidateQueries({
              queryKey: ["emails"],
              refetchType: "none",
            });
            queryClient.invalidateQueries({
              queryKey: ["mailboxes"],
              refetchType: "none",
            });
          }
        } catch (error) {
          console.error("Error parsing SSE message:", error);
        }
      };

      // Track mutation time to debounce SSE updates
      const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
        if (
          event?.type === "updated" &&
          event.mutation.state.status === "pending"
        ) {
          lastMutationTime = Date.now();
        }
      });

      eventSource.onerror = (error) => {
        console.error("SSE error:", error);
        eventSource.close();
      };

      return () => {
        eventSource.close();
        unsubscribe();
      };
    }
      }, [user, queryClient]);

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      dispatch(logout());
      queryClient.clear();
      navigate("/login");
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleSelectMailbox = (id: string) => {
    navigate(`/${id}`);
  };

  const handleSelectEmail = (email: Email) => {
    navigate(`/${selectedMailboxId}/${email.id}`);
    setMobileView("detail");
  };

  const handleToggleStar = () => {
    // Do nothing - let the mutation handle cache updates
    // This callback is kept for backward compatibility but no longer invalidates
  };

  const handleForward = (email: Email) => {
    const originalBody = email.body || email.preview || "";
    const forwardHeader = `---------- Forwarded message ---------\nFrom: ${email.from}\nDate: ${new Date(email.received_at).toLocaleString()}\nSubject: ${email.subject}\nTo: ${email.to.join(", ")}`;
    
    setComposeInitialData({
      to: [],
      cc: [],
      subject: `Fwd: ${email.subject}`,
      body: "",
      quotedContent: originalBody,
      quotedHeader: forwardHeader,
    });
    setIsComposeOpen(true);
  };

  const handleReply = (email: Email) => {
    const date = new Date(email.received_at);
    const weekday = date.toLocaleDateString("vi-VN", { weekday: "short" });
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const time = date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const dateStr = `Vào ${weekday}, ${day} thg ${month}, ${year} vào lúc ${time}`;

    let senderName = email.from;
    let senderEmail = email.from;
    const match = email.from.match(/^(.*?)\s*<(.*)>$/);
    if (match) {
      senderName = match[1].replace(/"/g, "").trim();
      senderEmail = match[2].trim();
    } else {
      senderName = email.from.replace(/"/g, "").trim();
      if (senderName.includes("@")) {
        senderEmail = senderName;
      }
    }

    const senderHtml = `${senderName} <${senderEmail}>`;

    const originalBody = email.body || email.preview || "";
    const quoteHeader = `Vào ${dateStr}, ${senderHtml} đã viết:`;
    
    setComposeInitialData({
      to: [senderEmail],
      cc: [],
      subject: `Re: ${email.subject}`,
      body: "",
      quotedContent: originalBody,
      quotedHeader: quoteHeader,
    });
    setIsComposeOpen(true);
  };

  const handleReplyAll = (email: Email) => {
    const date = new Date(email.received_at);
    const weekday = date.toLocaleDateString("vi-VN", { weekday: "short" });
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const time = date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const dateStr = `Vào ${weekday}, ${day} thg ${month}, ${year} vào lúc ${time}`;

    let senderName = email.from;
    let senderEmail = email.from;
    const match = email.from.match(/^(.*?)\s*<(.*)>$/);
    if (match) {
      senderName = match[1].replace(/"/g, "").trim();
      senderEmail = match[2].trim();
    } else {
      senderName = email.from.replace(/"/g, "").trim();
      if (senderName.includes("@")) {
        senderEmail = senderName;
      }
    }

    const senderHtml = `${senderName} <${senderEmail}>`;

    // Calculate CC list
    // CC = (Original To + Original CC) - (Me + Sender)
    const myEmail = user?.email || "";
    const allRecipients = [...(email.to || []), ...(email.cc || [])];

    const ccList = allRecipients
      .map((r) => {
        const match = r.match(/^(.*?)\s*<(.*)>$/);
        return match ? match[2].trim() : r.trim();
      })
      .filter(
        (email) =>
          email.toLowerCase() !== myEmail.toLowerCase() &&
          email.toLowerCase() !== senderEmail.toLowerCase()
      );

    // Remove duplicates
    const uniqueCcList = [...new Set(ccList)];

    const originalBody = email.body || email.preview || "";
    const quoteHeader = `Vào ${dateStr}, ${senderHtml} đã viết:`;
    
    setComposeInitialData({
      to: [senderEmail],
      cc: uniqueCcList,
      subject: `Re: ${email.subject}`,
      body: "",
      quotedContent: originalBody,
      quotedHeader: quoteHeader,
    });
    setIsComposeOpen(true);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-[#111418] text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-200">
      {/* Header - Desktop and Mobile */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e] shadow-sm">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileView("mailbox")}
          className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
            menu
          </span>
        </button>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br text-white from-blue-400 to-blue-500 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center shadow-md">
            <span className="material-symbols-outlined text-white text-[20px]">
              mail
            </span>
          </div>
          <span className="text-xl bg-linear-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent hidden sm:inline">
            Email Client AI
          </span>
        </div>

        {/* Semantic Search Bar with Auto-Suggestions */}
        <div className="flex-1 max-w-xl mx-4 hidden md:block">
          <SemanticSearchBar
            placeholder="Tìm kiếm email..."
            enableSuggestions={true}
          />
        </div>

        <KanbanToggle isKanban={false} onToggle={() => navigate("/kanban")} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {/* Desktop Layout - 3 columns */}
        <div className="hidden lg:flex h-full">
          {/* Column 1: Sidebar */}
          <div className="w-[220px] shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#111418]">
            <MailboxList
              selectedMailboxId={selectedMailboxId}
              onSelectMailbox={handleSelectMailbox}
              onComposeClick={() => setIsComposeOpen(true)}
              onLogout={handleLogout}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>
          {/* Column 2: Email List */}
          <div className="w-[360px] shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111418] flex flex-col">
            <EmailList
              mailboxId={selectedMailboxId}
              selectedEmailId={selectedEmailId}
              onSelectEmail={handleSelectEmail}
              onToggleStar={handleToggleStar}
            />
          </div>
          {/* Column 3: Email Detail */}
          <div className="flex-1 bg-white dark:bg-[#111418] min-w-0">
            <EmailDetail
              emailId={selectedEmailId}
              onToggleStar={handleToggleStar}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              theme={theme}
            />
          </div>
        </div>

        {/* Mobile Layout - Sliding panels */}
        <div className="lg:hidden h-full">
          {/* Mailbox List - Mobile Drawer */}
          <div
            className={`absolute inset-y-0 left-0 w-[280px] bg-gray-50 dark:bg-[#111418] border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 z-30 ${
              mobileView === "mailbox" ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Menu
              </h2>
              <button
                onClick={() => setMobileView("list")}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
              >
                <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
                  close
                </span>
              </button>
            </div>
            <MailboxList
              selectedMailboxId={selectedMailboxId}
              onSelectMailbox={(id) => {
                handleSelectMailbox(id);
                setMobileView("list");
              }}
              onComposeClick={() => {
                setIsComposeOpen(true);
                setMobileView("list");
              }}
              onLogout={handleLogout}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>

          {/* Email List - Mobile */}
          <div
            className={`absolute inset-0 bg-white dark:bg-[#111418] transition-transform duration-300 ${
              mobileView === "detail" ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            <EmailList
              mailboxId={selectedMailboxId}
              selectedEmailId={selectedEmailId}
              onSelectEmail={handleSelectEmail}
              onToggleStar={handleToggleStar}
            />
          </div>

          {/* Email Detail - Mobile */}
          <div
            className={`absolute inset-0 bg-white dark:bg-[#111418] transition-transform duration-300 ${
              mobileView === "detail" ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {selectedEmailId && (
              <>
                <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111418]">
                  <button
                    onClick={() => setMobileView("list")}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
                      arrow_back
                    </span>
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Email
                  </h2>
                </div>
                <div className="h-[calc(100%-60px)] overflow-auto">
                  <EmailDetail
                    emailId={selectedEmailId}
                    onToggleStar={handleToggleStar}
                    onReply={handleReply}
                    onReplyAll={handleReplyAll}
                    onForward={handleForward}
                    theme={theme}
                  />
                </div>
              </>
            )}
          </div>

          {/* Overlay for drawer */}
          {mobileView === "mailbox" && (
            <div
              className="absolute inset-0 bg-black/50 z-20"
              onClick={() => setMobileView("list")}
            />
          )}
        </div>
      </div>

      {/* Mobile Compose FAB */}
      <button
        onClick={() => setIsComposeOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-40"
      >
        <span className="material-symbols-outlined text-[24px]">edit</span>
      </button>

      {/* Compose Email Dialog */}
      <ComposeEmail
        open={isComposeOpen}
        onOpenChange={(open) => {
          setIsComposeOpen(open);
          if (!open)
            setComposeInitialData({ to: [], cc: [], subject: "", body: "", quotedContent: "", quotedHeader: "" });
        }}
        initialTo={composeInitialData.to}
        initialCc={composeInitialData.cc}
        initialSubject={composeInitialData.subject}
        initialBody={composeInitialData.body}
        quotedContent={composeInitialData.quotedContent}
        quotedHeader={composeInitialData.quotedHeader}
      />
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { emailService } from "@/services/email.service";
import { getAccessToken } from "@/lib/api-client";
import type { Email } from "@/types/email";
import MailboxList from "@/components/inbox/MailboxList";
import ComposeEmail from "@/components/inbox/ComposeEmail";
import EmailDetail from "@/components/inbox/EmailDetail";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config/api";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import type { KanbanColumn } from "@/components/kanban/KanbanBoard";
import KanbanToggle from "@/components/kanban/KanbanToggle";
import KanbanFilters, { type SortOption, type FilterState } from "@/components/kanban/KanbanFilters";
import { SnoozeDialog } from "@/components/inbox/SnoozeDialog";
import SemanticSearchBar from "@/components/search/SemanticSearchBar";

export default function KanbanPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);

  // Sidebar state
  const { mailbox } = useParams<{ mailbox?: string }>();
  const selectedMailboxId = mailbox || "inbox";
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitialData, setComposeInitialData] = useState({
    to: [] as string[],
    cc: [] as string[],
    subject: "",
    body: "",
  });

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      const initialTheme = (savedTheme as "light" | "dark") || systemTheme;

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

  // State cho popup chi tiết email
  const [detailEmailId, setDetailEmailId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"mailbox" | "kanban">("kanban");
  const [mobileSelectedColumn, setMobileSelectedColumn] =
    useState<string>("inbox");

  // Snooze dialog state
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [emailToSnooze, setEmailToSnooze] = useState<{
    id: string;
    subject: string;
  } | null>(null);

  const { data: summary, isFetching: isSummaryLoading } = useQuery({
    queryKey: ["email-summary", detailEmailId],
    queryFn: async () => {
      if (!detailEmailId) return "";
      return emailService.getEmailSummary(detailEmailId);
    },
    enabled: !!detailEmailId,
  });



  // Wake up mutation
  const wakeUpEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      await emailService.moveEmailToMailbox(emailId, "inbox");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  // Mutation cho kéo thả Kanban
  const moveEmailMutation = useMutation({
    mutationFn: async ({
      emailId,
      mailboxId,
    }: {
      emailId: string;
      mailboxId: string;
    }) => {
      await emailService.moveEmailToMailbox(emailId, mailboxId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  // State phân trang cho từng cột Kanban
  const [kanbanOffsets, setKanbanOffsets] = useState({
    inbox: 0,
    todo: 0,
    done: 0,
    snoozed: 0,
  });
  const limit = 20;

  // State emails cho từng cột (optimistic update)
  const [kanbanEmails, setKanbanEmails] = useState({
    inbox: [] as Email[],
    todo: [] as Email[],
    done: [] as Email[],
    snoozed: [] as Email[],
  });

  // Sorting and filtering state
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filters, setFilters] = useState<FilterState>({
    unreadOnly: false,
    withAttachments: false,
  });

  // Helper function to sort emails
  const sortEmails = (emails: Email[], sort: SortOption): Email[] => {
    return [...emails].sort((a, b) => {
      const dateA = new Date(a.received_at).getTime();
      const dateB = new Date(b.received_at).getTime();
      return sort === "newest" ? dateB - dateA : dateA - dateB;
    });
  };

  // Helper function to filter emails
  const filterEmails = (emails: Email[], filterState: FilterState): Email[] => {
    return emails.filter((email) => {
      if (filterState.unreadOnly && email.is_read) return false;
      if (filterState.withAttachments && (!email.attachments || email.attachments.length === 0)) return false;
      return true;
    });
  };

  // Query từng cột
  const {
    data: inboxData,
    isLoading: isLoadingInbox,
  } = useQuery({
    queryKey: ["emails", "kanban", "inbox", kanbanOffsets.inbox],
    queryFn: () =>
      emailService.getEmailsByStatus("inbox", limit, kanbanOffsets.inbox),
  });
  const {
    data: todoData,
    isLoading: isLoadingTodo,
  } = useQuery({
    queryKey: ["emails", "kanban", "todo", kanbanOffsets.todo],
    queryFn: () =>
      emailService.getEmailsByStatus("todo", limit, kanbanOffsets.todo),
  });
  const {
    data: doneData,
    isLoading: isLoadingDone,
  } = useQuery({
    queryKey: ["emails", "kanban", "done", kanbanOffsets.done],
    queryFn: () =>
      emailService.getEmailsByStatus("done", limit, kanbanOffsets.done),
  });
  const {
    data: snoozedData,
    isLoading: isLoadingSnoozed,
  } = useQuery({
    queryKey: ["emails", "kanban", "snoozed", kanbanOffsets.snoozed],
    queryFn: () =>
      emailService.getEmailsByStatus("snoozed", limit, kanbanOffsets.snoozed),
  });

  // Update kanbanEmails state when query data changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKanbanEmails({
      inbox: inboxData?.emails ?? [],
      todo: todoData?.emails ?? [],
      done: doneData?.emails ?? [],
      snoozed: snoozedData?.emails ?? [],
    });
  }, [inboxData, todoData, doneData, snoozedData]);

  // Track which emails have requested summaries
  const [requestedSummaries, setRequestedSummaries] = useState<Set<string>>(
    new Set()
  );

  // Track summary states
  const [summaryStates, setSummaryStates] = useState<
    Record<string, { summary: string; loading: boolean }>
  >({});

  // Handle summary request
  const handleRequestSummary = async (emailId: string) => {
    if (requestedSummaries.has(emailId)) return;

    setRequestedSummaries((prev) => new Set(prev).add(emailId));
    setSummaryStates((prev) => ({
      ...prev,
      [emailId]: { summary: "", loading: true },
    }));

    try {
      const summary = await emailService.getEmailSummary(emailId);
      setSummaryStates((prev) => ({
        ...prev,
        [emailId]: { summary, loading: false },
      }));
    } catch (error) {
      console.error("Error fetching summary:", error);
      setSummaryStates((prev) => ({
        ...prev,
        [emailId]: {
          summary: "Không thể tạo tóm tắt cho email này.",
          loading: false,
        },
      }));
    }
  };

  // Hàm chuyển trang cho từng cột
  const handleKanbanPage = (col: keyof typeof kanbanOffsets, dir: 1 | -1) => {
    setKanbanOffsets((prev) => ({
      ...prev,
      [col]: Math.max(0, prev[col] + dir * limit),
    }));
  };

  // Optimistic update khi kéo thả
  const handleKanbanDrop = (emailId: string, targetColumnId: string) => {
    // Find the email being moved
    let movedEmail: Email | undefined;
    for (const emails of Object.values(kanbanEmails)) {
      const found = emails.find((e) => e.id === emailId);
      if (found) {
        movedEmail = found;
        break;
      }
    }

    // If moving to snoozed, show dialog
    if (targetColumnId === "snoozed" && movedEmail) {
      setEmailToSnooze({
        id: emailId,
        subject: movedEmail.subject,
      });
      setSnoozeDialogOpen(true);
      return;
    }

    // Otherwise, proceed with normal move
    setKanbanEmails((prev) => {
      // Tìm email trong tất cả các cột
      let movedEmail: Email | undefined;
      const newEmails = Object.fromEntries(
        Object.entries(prev).map(([col, emails]) => {
          const filtered = emails.filter((e) => {
            if (e.id === emailId) {
              movedEmail = e;
              return false;
            }
            return true;
          });
          return [col, filtered];
        })
      ) as typeof prev;
      // Thêm email vào cột mới
      if (movedEmail) {
        newEmails[targetColumnId as keyof typeof newEmails] = [
          movedEmail,
          ...newEmails[targetColumnId as keyof typeof newEmails],
        ];
      }
      return newEmails;
    });
    // Call API ngầm
    moveEmailMutation.mutate({ emailId, mailboxId: targetColumnId });
  };

  // Handle snooze confirmation
  const handleSnoozeConfirm = (snoozeUntil: Date) => {
    if (!emailToSnooze) return;

    // Optimistic update
    setKanbanEmails((prev) => {
      let movedEmail: Email | undefined;
      const newEmails = Object.fromEntries(
        Object.entries(prev).map(([col, emails]) => {
          const filtered = emails.filter((e) => {
            if (e.id === emailToSnooze.id) {
              movedEmail = e;
              return false;
            }
            return true;
          });
          return [col, filtered];
        })
      ) as typeof prev;
      if (movedEmail) {
        newEmails.snoozed = [movedEmail, ...newEmails.snoozed];
      }
      return newEmails;
    });

    // Call API
    emailService.snoozeEmail(emailToSnooze.id, snoozeUntil).then(() => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    });

    // Reset state
    setSnoozeDialogOpen(false);
    setEmailToSnooze(null);
  };

  // Check if any column is loading
  const isAnyLoading =
    isLoadingInbox || isLoadingTodo || isLoadingDone || isLoadingSnoozed;

  // Apply sorting and filtering to columns using useMemo for performance
  const kanbanColumns: KanbanColumn[] = useMemo(() => {
    const processEmails = (emails: Email[]) => {
      let result = filterEmails(emails, filters);
      result = sortEmails(result, sortBy);
      return result;
    };

    return [
      {
        id: "inbox",
        title: "Inbox",
        emails: processEmails(kanbanEmails.inbox),
        offset: kanbanOffsets.inbox,
        limit,
      },
      {
        id: "todo",
        title: "To Do",
        emails: processEmails(kanbanEmails.todo),
        offset: kanbanOffsets.todo,
        limit,
      },
      {
        id: "done",
        title: "Done",
        emails: processEmails(kanbanEmails.done),
        offset: kanbanOffsets.done,
        limit,
      },
      {
        id: "snoozed",
        title: "Snoozed",
        emails: processEmails(kanbanEmails.snoozed),
        offset: kanbanOffsets.snoozed,
        limit,
      },
    ];
  }, [kanbanEmails, kanbanOffsets, filters, sortBy, limit]);

  useEffect(() => {
    if (user) {
      // Start watching for email updates
      emailService.watchMailbox().catch(console.error);

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
            // Ignore SSE updates for 3 seconds after user actions to prevent conflicts
            const timeSinceLastMutation = Date.now() - lastMutationTime;
            if (timeSinceLastMutation < 3000) {
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

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-[#111418] text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-200">
      {/* Header */}
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
            Email Client AI - Kanban
          </span>
        </div>

        {/* Semantic Search Bar with Auto-Suggestions */}
        <div className="flex-1 max-w-xl mx-4 hidden md:block">
          <SemanticSearchBar
            placeholder="Tìm kiếm email..."
            enableSuggestions={true}
          />
        </div>

        <KanbanToggle isKanban={true} onToggle={() => navigate("/inbox")} />
      </div>

      {/* Filter Bar */}
      <div className="hidden lg:block">
        <KanbanFilters
          sortBy={sortBy}
          onSortChange={setSortBy}
          filters={filters}
          onFilterChange={setFilters}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
        {/* Desktop Layout */}
        <div className="hidden lg:flex h-full">
          {/* Kanban Board */}
          <div className="flex-1 min-w-0 w-full">
            <KanbanBoard
              columns={kanbanColumns}
              onEmailDrop={handleKanbanDrop}
              onPageChange={(colId, dir) =>
                handleKanbanPage(colId as keyof typeof kanbanOffsets, dir)
              }
              emailSummaries={summaryStates}
              onRequestSummary={handleRequestSummary}
              isLoading={isAnyLoading}
              // Use the columnId passed from KanbanBoard so the card actions
              // reflect the column the card is currently rendered in (not the
              // email.mailbox_id which may be stale). Also update mailbox_id
              // optimistically when moving between columns.
              renderCardActions={(email, columnId) =>
                (columnId || email.mailbox_id) !== "snoozed" ? (
                  <>
                    <button
                      className="px-2 py-1 rounded bg-yellow-400 text-xs text-black hover:bg-yellow-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEmailToSnooze({
                          id: email.id,
                          subject: email.subject,
                        });
                        setSnoozeDialogOpen(true);
                      }}
                    >
                      Snooze
                    </button>
                  </>
                ) : (
                  <button
                    className="px-2 py-1 rounded bg-green-400 text-xs text-black hover:bg-green-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      setKanbanEmails((prev) => {
                        let movedEmail: Email | undefined;
                        const newEmails = Object.fromEntries(
                          Object.entries(prev).map(([col, emails]) => {
                            const filtered = emails.filter((ee) => {
                              if (ee.id === email.id) {
                                movedEmail = ee;
                                return false;
                              }
                              return true;
                            });
                            return [col, filtered];
                          })
                        ) as typeof prev;
                        if (movedEmail) {
                          movedEmail.mailbox_id = "inbox";
                          newEmails.inbox = [movedEmail, ...newEmails.inbox];
                        }
                        return newEmails;
                      });
                      wakeUpEmailMutation.mutate(email.id);
                    }}
                  >
                    Unsnooze
                  </button>
                )
              }
               onEmailClick={(emailId) => setDetailEmailId(emailId)}
             />
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden h-full">
          {/* Mailbox Drawer */}
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
                onClick={() => setMobileView("kanban")}
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
                setMobileView("kanban");
              }}
              onComposeClick={() => {
                setIsComposeOpen(true);
                setMobileView("kanban");
              }}
              onLogout={handleLogout}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>

          {/* Mobile Kanban - Column Selector */}
          <div className="h-full flex flex-col">
            {/* Column Tabs */}
            <div className="flex gap-1 p-2 bg-white dark:bg-[#1a1f2e] border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              {kanbanColumns.map((col) => (
                <button
                  key={col.id}
                  onClick={() => setMobileSelectedColumn(col.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    mobileSelectedColumn === col.id
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {col.title}
                  {col.emails.length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-white/20">
                      {col.emails.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Selected Column Content */}
            <div className="flex-1 overflow-auto p-4">
              {(() => {
                const selectedCol = kanbanColumns.find(
                  (c) => c.id === mobileSelectedColumn
                );
                if (!selectedCol) return null;

                return (
                  <div className="space-y-3">
                    {selectedCol.emails.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-2">
                          inbox
                        </span>
                        <p className="text-sm">Không có email</p>
                      </div>
                    ) : (
                      selectedCol.emails.map((email) => (
                        <div
                          key={email.id}
                          onClick={() => setDetailEmailId(email.id)}
                          className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1">
                              {email.subject || "(No Subject)"}
                            </h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 whitespace-nowrap">
                              {new Date(email.received_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                            {email.from_name || email.from}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                            {email.preview}
                          </p>

                          {/* Action Buttons */}
                          <div className="mt-3 flex gap-2">
                            {email.mailbox_id !== "snoozed" ? (
                              <button
                                className="px-3 py-1.5 rounded bg-yellow-400 text-xs text-black hover:bg-yellow-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEmailToSnooze({
                                    id: email.id,
                                    subject: email.subject,
                                  });
                                  setSnoozeDialogOpen(true);
                                }}
                              >
                                <span className="material-symbols-outlined text-xs mr-1">
                                  schedule
                                </span>
                                Snooze
                              </button>
                            ) : (
                              <button
                                className="px-3 py-1.5 rounded bg-green-400 text-xs text-black hover:bg-green-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setKanbanEmails((prev) => {
                                    let movedEmail: Email | undefined;
                                    const newEmails = Object.fromEntries(
                                      Object.entries(prev).map(
                                        ([col, emails]) => {
                                          const filtered = emails.filter(
                                            (e) => {
                                              if (e.id === email.id) {
                                                movedEmail = e;
                                                return false;
                                              }
                                              return true;
                                            }
                                          );
                                          return [col, filtered];
                                        }
                                      )
                                    ) as typeof prev;
                                    if (movedEmail) {
                                      newEmails.inbox = [movedEmail, ...newEmails.inbox];
                                    }
                                    return newEmails;
                                  });
                                  wakeUpEmailMutation.mutate(email.id);
                                }}
                              >
                                <span className="material-symbols-outlined text-xs mr-1">
                                  notifications_active
                                </span>
                                Unsnooze
                              </button>
                            )}

                            {/* Move to column buttons */}
                            {["inbox", "todo", "done"]
                              .filter((c) => c !== mobileSelectedColumn)
                              .map((colId) => (
                                <button
                                  key={colId}
                                  className="px-3 py-1.5 rounded bg-blue-100 dark:bg-blue-900/30 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleKanbanDrop(email.id, colId);
                                    setMobileSelectedColumn(colId);
                                  }}
                                >
                                  Move to {colId}
                                </button>
                              ))}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Pagination */}
                    {selectedCol.emails.length > 0 && (
                      <div className="flex justify-center gap-2 pt-4">
                        <button
                          onClick={() =>
                            handleKanbanPage(
                              mobileSelectedColumn as keyof typeof kanbanOffsets,
                              -1
                            )
                          }
                          disabled={selectedCol.offset === 0}
                          className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          ← Prev
                        </button>
                        <button
                          onClick={() =>
                            handleKanbanPage(
                              mobileSelectedColumn as keyof typeof kanbanOffsets,
                              1
                            )
                          }
                          disabled={selectedCol.emails.length < limit}
                          className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Overlay */}
          {mobileView === "mailbox" && (
            <div
              className="absolute inset-0 bg-black/50 z-20"
              onClick={() => setMobileView("kanban")}
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

      {/* Popup chi tiết email + summary Gemini */}
      {detailEmailId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30  backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col relative overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="absolute top-4 right-4 z-10">
              <button
                className="px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors border border-gray-200 dark:border-gray-700"
                onClick={() => setDetailEmailId(null)}
              >
                ✕ Đóng
              </button>
            </div>

            <div className="overflow-y-auto p-6 custom-scrollbar">
              <EmailDetail
                emailId={detailEmailId}
                onToggleStar={() => {}}
                theme={theme}
              />

              <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800/50">
                  <div className="flex items-center gap-2 font-semibold mb-3 text-blue-700 dark:text-blue-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Tóm tắt thông minh (Gemini AI)
                  </div>

                  {isSummaryLoading ? (
                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 py-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Đang phân tích nội dung email...</span>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed whitespace-pre-line text-gray-800 dark:text-gray-200">
                      {summary || "Không thể tạo tóm tắt cho email này."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compose Email Dialog */}
      <ComposeEmail
        open={isComposeOpen}
        onOpenChange={(open) => {
          setIsComposeOpen(open);
          if (!open)
            setComposeInitialData({ to: [], cc: [], subject: "", body: "" });
        }}
        initialTo={composeInitialData.to}
        initialCc={composeInitialData.cc}
        initialSubject={composeInitialData.subject}
        initialBody={composeInitialData.body}
      />

      {/* Snooze Dialog */}
      <SnoozeDialog
        open={snoozeDialogOpen}
        onOpenChange={setSnoozeDialogOpen}
        onConfirm={handleSnoozeConfirm}
        emailSubject={emailToSnooze?.subject}
      />
    </div>
  );
}

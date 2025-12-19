package usecase

import (
	"context"
	emaildomain "ga03-backend/internal/email/domain"
	"mime/multipart"
	"time"
)

// EmailUsecase defines the interface for email use cases
type EmailUsecase interface {
	GetAllMailboxes(userID string) ([]*emaildomain.Mailbox, error)
	GetMailboxByID(id string) (*emaildomain.Mailbox, error)
	GetEmailsByMailbox(userID, mailboxID string, limit, offset int, query string) ([]*emaildomain.Email, int, error)
	GetEmailsByStatus(userID, status string, limit, offset int) ([]*emaildomain.Email, int, error)
	GetEmailByID(userID, id string) (*emaildomain.Email, error)
	GetAttachment(userID, messageID, attachmentID string) (*emaildomain.Attachment, []byte, error)
	MarkEmailAsRead(userID, id string) error
	MarkEmailAsUnread(userID, id string) error
	ToggleStar(userID, id string) error
	SendEmail(userID, to, cc, bcc, subject, body string, files []*multipart.FileHeader) error
	TrashEmail(userID, id string) error
	ArchiveEmail(userID, id string) error
	WatchMailbox(userID string) error
	SummarizeEmail(ctx context.Context, emailID string) (string, error)
	MoveEmailToMailbox(userID, emailID, mailboxID string) error
	SnoozeEmail(userID, emailID string, snoozeUntil time.Time) error
	FuzzySearch(userID, query string, limit, offset int) ([]*emaildomain.Email, int, error)
	SemanticSearch(ctx context.Context, userID, query string, limit, offset int) ([]*emaildomain.Email, int, error)
	GetSearchSuggestions(ctx context.Context, userID, query string, limit int) ([]string, error)
	GetKanbanColumns(userID string) ([]*emaildomain.KanbanColumn, error)
	CreateKanbanColumn(userID, name string, order int, gmailLabel string) (*emaildomain.KanbanColumn, error)
	UpdateKanbanColumn(userID, columnID, name string, order int, gmailLabel string) (*emaildomain.KanbanColumn, error)
	DeleteKanbanColumn(userID, columnID string) error
	SetGeminiService(svc interface {
		SummarizeEmail(ctx context.Context, emailText string) (string, error)
		GenerateEmbedding(ctx context.Context, text string) ([]float32, error)
	})
	SetChromaClient(client interface{}, collection interface{})
}

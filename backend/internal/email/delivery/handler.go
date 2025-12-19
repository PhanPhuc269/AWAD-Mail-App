package delivery

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"time"

	authdomain "ga03-backend/internal/auth/domain"
	emaildto "ga03-backend/internal/email/dto"
	"ga03-backend/internal/email/usecase"

	"github.com/gin-gonic/gin"
)

type EmailHandler struct {
	emailUsecase usecase.EmailUsecase
}

// GET /emails/:id/summary
func (h *EmailHandler) SummarizeEmail(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()
	user, exists := c.Get("user")
	var userID string
	if exists {
		if u, ok := user.(*authdomain.User); ok {
			userID = u.ID
		}
	}
	ctx = context.WithValue(ctx, "userID", userID)
	summary, err := h.emailUsecase.SummarizeEmail(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"summary": summary})
}

// PATCH /emails/:id/mailbox
func (h *EmailHandler) MoveEmailToMailbox(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		MailboxID string `json:"mailbox_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.MailboxID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing mailbox_id"})
		return
	}
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID
	if err := h.emailUsecase.MoveEmailToMailbox(userID, id, req.MailboxID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "email moved", "mailbox_id": req.MailboxID})
}

// POST /emails/:id/snooze
func (h *EmailHandler) SnoozeEmail(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		SnoozeUntil string `json:"snooze_until"` // ISO 8601 format
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.SnoozeUntil == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing snooze_until"})
		return
	}

	snoozeTime, err := time.Parse(time.RFC3339, req.SnoozeUntil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Use ISO 8601"})
		return
	}

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	if err := h.emailUsecase.SnoozeEmail(userID, id, snoozeTime); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "email snoozed", "snooze_until": snoozeTime})
}

func NewEmailHandler(emailUsecase usecase.EmailUsecase) *EmailHandler {
	return &EmailHandler{
		emailUsecase: emailUsecase,
	}
}

func (h *EmailHandler) GetAllMailboxes(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	mailboxes, err := h.emailUsecase.GetAllMailboxes(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, emaildto.MailboxesResponse{Mailboxes: mailboxes})
}

func (h *EmailHandler) GetMailboxByID(c *gin.Context) {
	id := c.Param("id")
	mailbox, err := h.emailUsecase.GetMailboxByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if mailbox == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "mailbox not found"})
		return
	}

	c.JSON(http.StatusOK, mailbox)
}

func (h *EmailHandler) GetEmailsByMailbox(c *gin.Context) {
	mailboxID := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	limit := 20
	offset := 0

	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsed, err := strconv.Atoi(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	query := c.Query("q")

	emails, total, err := h.emailUsecase.GetEmailsByMailbox(userID, mailboxID, limit, offset, query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, emaildto.EmailsResponse{
		Emails: emails,
		Limit:  limit,
		Offset: offset,
		Total:  total,
	})
}

func (h *EmailHandler) GetEmailByID(c *gin.Context) {
	id := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	email, err := h.emailUsecase.GetEmailByID(userID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if email == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "email not found"})
		return
	}

	// Mark as read when viewing
	_ = h.emailUsecase.MarkEmailAsRead(userID, id)

	c.JSON(http.StatusOK, email)
}

func (h *EmailHandler) MarkAsRead(c *gin.Context) {
	id := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	if err := h.emailUsecase.MarkEmailAsRead(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email marked as read"})
}

func (h *EmailHandler) MarkAsUnread(c *gin.Context) {
	id := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	if err := h.emailUsecase.MarkEmailAsUnread(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email marked as unread"})
}

func (h *EmailHandler) ToggleStar(c *gin.Context) {
	id := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	if err := h.emailUsecase.ToggleStar(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email star toggled"})
}

func (h *EmailHandler) SendEmail(c *gin.Context) {
	var req emaildto.SendEmailRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	if err := h.emailUsecase.SendEmail(userID, req.To, req.Cc, req.Bcc, req.Subject, req.Body, req.Files); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email sent successfully"})
}

func (h *EmailHandler) TrashEmail(c *gin.Context) {
	id := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	if err := h.emailUsecase.TrashEmail(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email moved to trash"})
}

func (h *EmailHandler) ArchiveEmail(c *gin.Context) {
	id := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	if err := h.emailUsecase.ArchiveEmail(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email archived"})
}

func (h *EmailHandler) WatchMailbox(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	// Log the watch request
	log.Printf("Received watch request for user: %s", userID)

	err := h.emailUsecase.WatchMailbox(userID)
	if err != nil {
		log.Printf("Failed to watch mailbox for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Successfully started watching mailbox for user: %s", userID)
	c.JSON(http.StatusOK, gin.H{"message": "watch started"})
}

func (h *EmailHandler) GetAttachment(c *gin.Context) {
	messageID := c.Param("id")
	attachmentID := c.Param("attachmentId")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}

	userID := userData.ID

	attachment, data, err := h.emailUsecase.GetAttachment(userID, messageID, attachmentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Disposition", "attachment; filename="+attachment.Name)
	c.Data(http.StatusOK, attachment.MimeType, data)
}

// GET /emails/status/:status
func (h *EmailHandler) GetEmailsByStatus(c *gin.Context) {
	status := c.Param("status")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	limit := 20
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsed, err := strconv.Atoi(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	emails, total, err := h.emailUsecase.GetEmailsByStatus(userID, status, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, emaildto.EmailsResponse{
		Emails: emails,
		Limit:  limit,
		Offset: offset,
		Total:  total,
	})
}

// GET /emails/search?q=query
// FuzzySearch handles fuzzy search over emails
func (h *EmailHandler) FuzzySearch(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing search query parameter 'q'"})
		return
	}

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	limit := 50
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsed, err := strconv.Atoi(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	emails, total, err := h.emailUsecase.FuzzySearch(userID, query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, emaildto.EmailsResponse{
		Emails: emails,
		Limit:  limit,
		Offset: offset,
		Total:  total,
	})
}

// POST /emails/search/semantic
// SemanticSearch handles semantic search using vector embeddings
func (h *EmailHandler) SemanticSearch(c *gin.Context) {
	var req struct {
		Query  string `json:"query" binding:"required"`
		Limit  int    `json:"limit"`
		Offset int    `json:"offset"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if req.Query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing query"})
		return
	}

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	limit := req.Limit
	if limit <= 0 {
		limit = 20
	}
	offset := req.Offset
	if offset < 0 {
		offset = 0
	}

	ctx := c.Request.Context()
	emails, total, err := h.emailUsecase.SemanticSearch(ctx, userID, req.Query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, emaildto.EmailsResponse{
		Emails: emails,
		Limit:  limit,
		Offset: offset,
		Total:  total,
	})
}

// GET /emails/search/suggestions?q=query&limit=5
// GetSearchSuggestions returns search suggestions
func (h *EmailHandler) GetSearchSuggestions(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusOK, gin.H{"suggestions": []string{}})
		return
	}

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	limit := 5
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 && parsed <= 10 {
			limit = parsed
		}
	}

	ctx := c.Request.Context()
	suggestions, err := h.emailUsecase.GetSearchSuggestions(ctx, userID, query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"suggestions": suggestions})
}

// GET /emails/kanban/columns
// GetKanbanColumns returns all Kanban columns for the authenticated user
func (h *EmailHandler) GetKanbanColumns(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	columns, err := h.emailUsecase.GetKanbanColumns(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"columns": columns})
}

// POST /emails/kanban/columns
// CreateKanbanColumn creates a new Kanban column
func (h *EmailHandler) CreateKanbanColumn(c *gin.Context) {
	var req struct {
		Name      string `json:"name" binding:"required"`
		Order     int    `json:"order"`
		GmailLabel string `json:"gmail_label"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	column, err := h.emailUsecase.CreateKanbanColumn(userID, req.Name, req.Order, req.GmailLabel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, column)
}

// PUT /emails/kanban/columns/:id
// UpdateKanbanColumn updates an existing Kanban column
func (h *EmailHandler) UpdateKanbanColumn(c *gin.Context) {
	columnID := c.Param("id")
	var req struct {
		Name      string `json:"name" binding:"required"`
		Order     int    `json:"order"`
		GmailLabel string `json:"gmail_label"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	column, err := h.emailUsecase.UpdateKanbanColumn(userID, columnID, req.Name, req.Order, req.GmailLabel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, column)
}

// DELETE /emails/kanban/columns/:id
// DeleteKanbanColumn deletes a Kanban column
func (h *EmailHandler) DeleteKanbanColumn(c *gin.Context) {
	columnID := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	if err := h.emailUsecase.DeleteKanbanColumn(userID, columnID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "column deleted"})
}

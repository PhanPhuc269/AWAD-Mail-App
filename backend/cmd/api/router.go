package api

import (
	"ga03-backend/internal/auth/delivery"
	authUsecase "ga03-backend/internal/auth/usecase"
	emailDelivery "ga03-backend/internal/email/delivery"
	emailUsecase "ga03-backend/internal/email/usecase"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/sse"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine, authUsecase authUsecase.AuthUsecase, emailUsecase emailUsecase.EmailUsecase, sseManager *sse.Manager, cfg *config.Config) {
	authHandler := delivery.NewAuthHandler(authUsecase)
	emailHandler := emailDelivery.NewEmailHandler(emailUsecase)

	api := r.Group("/api")
	{
		// SSE endpoint
		api.GET("/events", delivery.AuthMiddleware(authUsecase), func(c *gin.Context) {
			userID := c.GetString("userID")
			sseManager.ServeHTTP(c, userID)
		})

		// Auth routes
		auth := api.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
			auth.POST("/imap", authHandler.IMAPLogin)
			auth.POST("/register", authHandler.Register)
			auth.POST("/google", authHandler.GoogleSignIn)
			auth.POST("/refresh", authHandler.RefreshToken)
			auth.GET("/me", delivery.AuthMiddleware(authUsecase), authHandler.Me)
			auth.POST("/logout", authHandler.Logout)
			auth.POST("/set-password", delivery.AuthMiddleware(authUsecase), authHandler.SetPassword)
		}

		// Email routes (protected)
		emails := api.Group("/emails")
		emails.Use(delivery.AuthMiddleware(authUsecase))
		{
			emails.GET("/mailboxes", emailHandler.GetAllMailboxes)
			emails.GET("/mailboxes/:id", emailHandler.GetMailboxByID)
			emails.GET("/mailboxes/:id/emails", emailHandler.GetEmailsByMailbox)
			emails.GET("/status/:status", emailHandler.GetEmailsByStatus) // Kanban status API
			emails.GET("/:id", emailHandler.GetEmailByID)
			emails.GET("/:id/summary", emailHandler.SummarizeEmail)
			emails.GET("/:id/attachments/:attachmentId", emailHandler.GetAttachment)
			emails.PATCH("/:id/read", emailHandler.MarkAsRead)
			emails.PATCH("/:id/unread", emailHandler.MarkAsUnread)
			emails.PATCH("/:id/star", emailHandler.ToggleStar)
			emails.PATCH("/:id/mailbox", emailHandler.MoveEmailToMailbox)
			emails.POST("/:id/snooze", emailHandler.SnoozeEmail)
			emails.POST("/send", emailHandler.SendEmail)
			emails.POST("/:id/trash", emailHandler.TrashEmail)
			emails.POST("/:id/archive", emailHandler.ArchiveEmail)
			emails.POST("/watch", emailHandler.WatchMailbox)
			emails.GET("/search", emailHandler.FuzzySearch)
			emails.POST("/search/semantic", emailHandler.SemanticSearch)
			emails.GET("/search/suggestions", emailHandler.GetSearchSuggestions)
			
			// Kanban column configuration
			emails.GET("/kanban/columns", emailHandler.GetKanbanColumns)
			emails.POST("/kanban/columns", emailHandler.CreateKanbanColumn)
			emails.PUT("/kanban/columns/:id", emailHandler.UpdateKanbanColumn)
			emails.DELETE("/kanban/columns/:id", emailHandler.DeleteKanbanColumn)
		}
	}
}

package main

import (
	"context"
	"log"
	"os"
	"strings"

	api "ga03-backend/cmd/api"
	authdomain "ga03-backend/internal/auth/domain"
	authRepo "ga03-backend/internal/auth/repository"
	authUsecase "ga03-backend/internal/auth/usecase"
	emaildomain "ga03-backend/internal/email/domain"
	emailRepo "ga03-backend/internal/email/repository"
	emailUsecase "ga03-backend/internal/email/usecase"
	"ga03-backend/internal/notification"
	"ga03-backend/pkg/chroma"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/database"
	"ga03-backend/pkg/gmail"
	"ga03-backend/pkg/imap"
	"ga03-backend/pkg/sse"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := database.NewPostgresConnection(cfg)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto-migrate database schemas
	if err := db.AutoMigrate(&authdomain.User{}, &authdomain.RefreshToken{}, &emaildomain.KanbanColumn{}); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Initialize repositories (dependency injection)
	userRepo := authRepo.NewUserRepository(db)
	emailRepository := emailRepo.NewEmailRepository()
	kanbanRepository := emailRepo.NewKanbanRepository(db)

	// Initialize SSE Manager
	sseManager := sse.NewManager()
	go sseManager.Run()

	// Initialize Notification Service (Pub/Sub)
	// Only start if project ID is configured
	if cfg.GoogleProjectID != "" {
		// Extract short topic name from full resource name if necessary
		topicName := cfg.GooglePubSubTopic
		if parts := strings.Split(topicName, "/"); len(parts) > 1 {
			topicName = parts[len(parts)-1]
		}
		if topicName == "" {
			topicName = "gmail-updates"
		}

		notifService, err := notification.NewService(cfg.GoogleProjectID, topicName, sseManager, userRepo, cfg.GoogleCredentials)
		if err != nil {
			log.Printf("Failed to initialize notification service: %v", err)
		} else {
			go notifService.Start(context.Background())
		}
	}

	// Initialize Gmail service
	gmailService := gmail.NewService(cfg.GoogleClientID, cfg.GoogleClientSecret)

	// Initialize IMAP service
	imapService := imap.NewService()

	// Initialize use cases (dependency injection)
	authUsecaseInstance := authUsecase.NewAuthUsecase(userRepo, cfg)
	emailUsecaseInstance := emailUsecase.NewEmailUsecase(emailRepository, kanbanRepository, userRepo, gmailService, imapService, cfg, cfg.GooglePubSubTopic)

	// Initialize ChromaDB Cloud Client
	// CHROMA_API_KEY is required
	// GEMINI_API_KEY should be set in environment for embeddings
	chromaClient, err := chroma.NewChromaClient(cfg.ChromaCloudAPIKey, cfg.ChromaTenant, cfg.ChromaDatabase)
	if err != nil {
		log.Printf("Warning: Failed to connect to ChromaDB: %v. Semantic search will fallback to fuzzy search.", err)
	} else {
		ctx := context.Background()
		collection, err := chromaClient.GetOrCreateCollection(ctx)
		if err != nil {
			log.Printf("Warning: Failed to get/create ChromaDB collection: %v", err)
		} else {
			emailUsecaseInstance.SetChromaClient(chromaClient, collection)
			if cfg.UseChromaCloud {
				log.Printf("ChromaDB Cloud initialized successfully with Gemini embedding function")
			} else {
				log.Printf("ChromaDB local initialized successfully with Gemini embedding function")
			}
		}
	}

	// Initialize HTTP handler
	handler := api.NewHandler(authUsecaseInstance, emailUsecaseInstance, sseManager, cfg)

	// Start server

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := handler.Start(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

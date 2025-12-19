package api

import (
	"log"

	authUsecase "ga03-backend/internal/auth/usecase"
	emailUsecase "ga03-backend/internal/email/usecase"
	"ga03-backend/pkg/config"
	gemini "ga03-backend/pkg/gemini"
	"ga03-backend/pkg/sse"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	authUsecase  authUsecase.AuthUsecase
	emailUsecase emailUsecase.EmailUsecase
	sseManager   *sse.Manager
	config       *config.Config
}

func NewHandler(authUsecase authUsecase.AuthUsecase, emailUsecase emailUsecase.EmailUsecase, sseManager *sse.Manager, cfg *config.Config) *Handler {
	// Khởi tạo GeminiService từ API key trong config
	geminiSvc, err := gemini.NewGeminiService(cfg.GeminiApiKey)
	if err != nil {
		log.Printf("Warning: Failed to initialize Gemini service: %v", err)
	} else {
		// Gán GeminiService vào emailUsecase qua interface
		emailUsecase.SetGeminiService(geminiSvc)
	}
	return &Handler{
		authUsecase:  authUsecase,
		emailUsecase: emailUsecase,
		sseManager:   sseManager,
		config:       cfg,
	}
}

func (h *Handler) Start(addr string) error {
	r := gin.Default()
	gin.SetMode(gin.ReleaseMode)

	// CORS middleware
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Setup routes
	SetupRoutes(r, h.authUsecase, h.emailUsecase, h.sseManager, h.config)

	return r.Run(addr)
}

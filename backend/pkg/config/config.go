package config

import (
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port               string
	JWTSecret          string
	JWTAccessExpiry    time.Duration
	JWTRefreshExpiry   time.Duration
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI  string
	GoogleProjectID    string
	GooglePubSubTopic  string
	GoogleCredentials  string // Path to service account JSON
	DBHost             string
	DBPort             string
	DBUser             string
	DBPassword         string
	DBName             string
	DBSSLMode          string
	GeminiApiKey       string
	EncryptionKey      string // 32-byte key for AES encryption
	ChromaHost         string
	ChromaPort         int
	ChromaCloudAPIKey  string
	ChromaTenant       string
	ChromaDatabase     string
	UseChromaCloud     bool
}

func Load() *Config {
	// Load .env file if it exists
	_ = godotenv.Load()

	accessExpiry := 15 * time.Minute
	if exp := os.Getenv("JWT_ACCESS_EXPIRY"); exp != "" {
		if parsed, err := time.ParseDuration(exp); err == nil {
			accessExpiry = parsed
		}
	}

	refreshExpiry := 168 * time.Hour // 7 days
	if exp := os.Getenv("JWT_REFRESH_EXPIRY"); exp != "" {
		if parsed, err := time.ParseDuration(exp); err == nil {
			refreshExpiry = parsed
		}
	}

	return &Config{
		Port:               getEnv("PORT", "8080"),
		JWTSecret:          getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		JWTAccessExpiry:    accessExpiry,
		JWTRefreshExpiry:   refreshExpiry,
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURI:  os.Getenv("GOOGLE_REDIRECT_URI"),
		GoogleProjectID:    getEnv("GOOGLE_PROJECT_ID", "gomailclient"),
		GooglePubSubTopic:  getEnv("GOOGLE_PUBSUB_TOPIC", "projects/gomailclient/topics/gmail-updates"),
		GoogleCredentials:  os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"),
		DBHost:             os.Getenv("DB_HOST"),
		DBPort:             getEnv("DB_PORT", "5432"),
		DBUser:             getEnv("DB_USER", "postgres"),
		DBPassword:         getEnv("DB_PASSWORD", "postgres"),
		DBName:             getEnv("DB_NAME", "email_dashboard"),
		DBSSLMode:          getEnv("DB_SSLMODE", "disable"),
		GeminiApiKey:       os.Getenv("GEMINI_API_KEY"),
		EncryptionKey:      getEnv("ENCRYPTION_KEY", "12345678901234567890123456789012"), // Default for dev only
		ChromaHost:         getEnv("CHROMA_HOST", "localhost"),
		ChromaPort:         getEnvInt("CHROMA_PORT", 8000),
		ChromaCloudAPIKey:  os.Getenv("CHROMA_API_KEY"),
		ChromaTenant:       os.Getenv("CHROMA_TENANT"),
		ChromaDatabase:     os.Getenv("CHROMA_DATABASE"),
		UseChromaCloud:     os.Getenv("CHROMA_API_KEY") != "", // Use cloud if API key is set
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		var result int
		if _, err := fmt.Sscanf(value, "%d", &result); err == nil {
			return result
		}
	}
	return defaultValue
}

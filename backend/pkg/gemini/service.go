package gemini

import (
	"context"
	"fmt"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

type GeminiService struct {
	client *genai.Client
}

func NewGeminiService(apiKey string) (*GeminiService, error) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	return &GeminiService{
		client: client,
	}, nil
}

// GenerateEmbedding generates an embedding for the given text using Gemini embedding model
func (g *GeminiService) GenerateEmbedding(ctx context.Context, text string) ([]float32, error) {
	// Truncate text if too long (Gemini has 2048 token limit)
	if len(text) > 8000 {
		text = text[:8000]
	}

	// Use the embedding model
	model := g.client.EmbeddingModel("models/text-embedding-004")

	// Generate embedding
	resp, err := model.EmbedContent(ctx, genai.Text(text))
	if err != nil {
		return nil, fmt.Errorf("failed to generate embedding: %w", err)
	}

	// Extract embedding values
	if resp.Embedding == nil || len(resp.Embedding.Values) == 0 {
		return nil, fmt.Errorf("no embedding values in response")
	}

	embeddingVector := make([]float32, len(resp.Embedding.Values))
	for i, v := range resp.Embedding.Values {
		embeddingVector[i] = float32(v)
	}

	return embeddingVector, nil
}

func (g *GeminiService) SummarizeEmail(ctx context.Context, emailText string) (string, error) {
	// Use gemini-2.5-flash for summarization
	model := g.client.GenerativeModel("gemini-2.5-flash")

	prompt := "Hãy tóm tắt nội dung email sau bằng tiếng Việt, chỉ nêu ý chính, không thêm nhận xét cá nhân: " + emailText

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		return "", fmt.Errorf("failed to generate summary: %w", err)
	}

	// Extract text from response
	if len(resp.Candidates) == 0 {
		return "", fmt.Errorf("no candidates in response")
	}

	candidate := resp.Candidates[0]
	if len(candidate.Content.Parts) == 0 {
		return "", fmt.Errorf("no content parts in response")
	}

	part := candidate.Content.Parts[0]
	if textPart, ok := part.(genai.Text); ok {
		return string(textPart), nil
	}

	return "", fmt.Errorf("unexpected response format")
}

package chroma

import (
	"context"
	"fmt"
	"log"

	chromacloud "github.com/amikos-tech/chroma-go/pkg/api/v2"
	"github.com/amikos-tech/chroma-go/pkg/embeddings"
	geminiembed "github.com/amikos-tech/chroma-go/pkg/embeddings/gemini"
)

// GeminiEmbeddingFunctionAdapter adapts geminiembed.GeminiEmbeddingFunction to embeddings.EmbeddingFunction
type GeminiEmbeddingFunctionAdapter struct {
	geminiEF *geminiembed.GeminiEmbeddingFunction
}

func (a *GeminiEmbeddingFunctionAdapter) EmbedDocuments(ctx context.Context, documents []string) ([]embeddings.Embedding, error) {
	return a.geminiEF.EmbedDocuments(ctx, documents)
}

func (a *GeminiEmbeddingFunctionAdapter) EmbedQuery(ctx context.Context, document string) (embeddings.Embedding, error) {
	return a.geminiEF.EmbedQuery(ctx, document)
}

type ChromaClient struct {
	client         chromacloud.Client
	embeddingFunc  embeddings.EmbeddingFunction
	collectionName string
}

// NewChromaClient creates a ChromaDB Cloud Client
func NewChromaClient(cloudAPIKey, tenant, database string) (*ChromaClient, error) {
	if cloudAPIKey == "" {
		return nil, fmt.Errorf("CHROMA_API_KEY is required for Chroma Cloud Client")
	}

	// Create client options
	opts := []chromacloud.ClientOption{
		chromacloud.WithCloudAPIKey(cloudAPIKey),
	}
	if tenant != "" && database != "" {
		opts = append(opts, chromacloud.WithDatabaseAndTenant(database, tenant))
	} else if tenant != "" {
		opts = append(opts, chromacloud.WithTenant(tenant))
	}

	// Create Cloud Client
	client, err := chromacloud.NewHTTPClient(opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create Chroma Cloud client: %w", err)
	}

	// Create Gemini embedding function
	// API key should be in environment variable GEMINI_API_KEY
	var ef embeddings.EmbeddingFunction
	geminiEF, err := geminiembed.NewGeminiEmbeddingFunction(
		geminiembed.WithEnvAPIKey(),
		geminiembed.WithDefaultModel("text-embedding-004"),
	)
	if err != nil {
		log.Printf("Warning: Failed to create Gemini embedding function: %v", err)
	} else {
		// Wrap in adapter
		ef = &GeminiEmbeddingFunctionAdapter{geminiEF: geminiEF}
	}

	log.Printf("Using Chroma Cloud Client")
	return &ChromaClient{
		client:         client,
		embeddingFunc:  ef,
		collectionName: "email_embeddings",
	}, nil
}

// GetOrCreateCollection gets or creates a collection for storing email embeddings
// Uses Gemini embedding function for automatic embedding generation
func (c *ChromaClient) GetOrCreateCollection(ctx context.Context) (chromacloud.Collection, error) {
	if c.embeddingFunc == nil {
		return nil, fmt.Errorf("embedding function not configured")
	}

	// Use GetOrCreateCollection with embedding function option
	collection, err := c.client.GetOrCreateCollection(ctx, c.collectionName,
		chromacloud.WithEmbeddingFunctionCreate(c.embeddingFunc),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get or create collection: %w", err)
	}

	log.Printf("Got or created ChromaDB Cloud collection: %s with Gemini embedding function", c.collectionName)
	return collection, nil
}

// AddEmailEmbedding adds an email embedding to the collection
// ChromaDB will automatically generate embeddings using the Gemini embedding function
func (c *ChromaClient) AddEmailEmbedding(ctx context.Context, collection chromacloud.Collection, emailID, userID, subject, body string, embedding []float32) error {
	// Combine subject and body for the document text
	document := fmt.Sprintf("%s\n%s", subject, body)
	if len(document) > 10000 {
		document = document[:10000] // Truncate if too long
	}

	// Metadata for filtering by user
	metadataMap := map[string]interface{}{
		"user_id":  userID,
		"email_id": emailID,
		"subject":  subject,
	}
	metadata, err := chromacloud.NewDocumentMetadataFromMap(metadataMap)
	if err != nil {
		return fmt.Errorf("failed to create metadata: %w", err)
	}

	// Add to collection - ChromaDB will automatically generate embeddings
	// Use WithTexts, WithMetadatas, WithIDs directly
	err = collection.Add(ctx,
		chromacloud.WithTexts(document),
		chromacloud.WithMetadatas(metadata),
		chromacloud.WithIDs(chromacloud.DocumentID(emailID)),
	)
	if err != nil {
		return fmt.Errorf("failed to add embedding: %w", err)
	}

	return nil
}

// QuerySimilarEmails queries for semantically similar emails using query text
// ChromaDB will automatically generate embeddings for the query text
func (c *ChromaClient) QuerySimilarEmails(ctx context.Context, collection chromacloud.Collection, queryText string, userID string, limit int) (chromacloud.QueryResult, error) {
	// Filter by user_id in metadata using WhereClause
	where := chromacloud.EqString("user_id", userID)

	// Query using query text - ChromaDB will generate embeddings automatically
	results, err := collection.Query(ctx,
		chromacloud.WithQueryTexts(queryText),
		chromacloud.WithNResults(limit),
		chromacloud.WithWhereQuery(where),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query embeddings: %w", err)
	}

	return results, nil
}

// DeleteEmailEmbedding removes an email embedding from the collection
func (c *ChromaClient) DeleteEmailEmbedding(ctx context.Context, collection chromacloud.Collection, emailID string) error {
	err := collection.Delete(ctx,
		chromacloud.WithIDsDelete(chromacloud.DocumentID(emailID)),
	)
	if err != nil {
		return fmt.Errorf("failed to delete embedding: %w", err)
	}
	return nil
}

// UpdateEmailEmbedding updates an existing email embedding
func (c *ChromaClient) UpdateEmailEmbedding(ctx context.Context, collection chromacloud.Collection, emailID, userID, subject, body string, embedding []float32) error {
	// First delete the old embedding
	if err := c.DeleteEmailEmbedding(ctx, collection, emailID); err != nil {
		log.Printf("Warning: failed to delete old embedding for %s: %v", emailID, err)
	}

	// Then add the new one (ChromaDB will auto-generate embeddings)
	return c.AddEmailEmbedding(ctx, collection, emailID, userID, subject, body, embedding)
}

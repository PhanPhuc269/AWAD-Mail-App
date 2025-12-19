package domain

import "time"

// KanbanColumn represents a user-configured Kanban column
type KanbanColumn struct {
	ID        string    `json:"id" gorm:"primaryKey"`
	UserID    string    `json:"user_id" gorm:"index;not null"`
	Name      string    `json:"name" gorm:"not null"`
	Order     int       `json:"order" gorm:"not null"` // Display order
	GmailLabel string   `json:"gmail_label,omitempty"` // Gmail label to map to (e.g., "STARRED", "INBOX", custom label)
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}


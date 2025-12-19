package repository

import (
	"fmt"

	emaildomain "ga03-backend/internal/email/domain"

	"gorm.io/gorm"
)

type KanbanRepository interface {
	GetColumnsByUserID(userID string) ([]*emaildomain.KanbanColumn, error)
	GetColumnByID(id string) (*emaildomain.KanbanColumn, error)
	CreateColumn(column *emaildomain.KanbanColumn) error
	UpdateColumn(column *emaildomain.KanbanColumn) error
	DeleteColumn(id string) error
	DeleteColumnsByUserID(userID string) error
}

type kanbanRepository struct {
	db *gorm.DB
}

func NewKanbanRepository(db *gorm.DB) KanbanRepository {
	return &kanbanRepository{db: db}
}

func (r *kanbanRepository) GetColumnsByUserID(userID string) ([]*emaildomain.KanbanColumn, error) {
	var columns []*emaildomain.KanbanColumn
	if err := r.db.Where("user_id = ?", userID).Order("`order` ASC").Find(&columns).Error; err != nil {
		return nil, fmt.Errorf("failed to get columns: %w", err)
	}
	return columns, nil
}

func (r *kanbanRepository) GetColumnByID(id string) (*emaildomain.KanbanColumn, error) {
	var column emaildomain.KanbanColumn
	if err := r.db.First(&column, "id = ?", id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get column: %w", err)
	}
	return &column, nil
}

func (r *kanbanRepository) CreateColumn(column *emaildomain.KanbanColumn) error {
	if err := r.db.Create(column).Error; err != nil {
		return fmt.Errorf("failed to create column: %w", err)
	}
	return nil
}

func (r *kanbanRepository) UpdateColumn(column *emaildomain.KanbanColumn) error {
	if err := r.db.Save(column).Error; err != nil {
		return fmt.Errorf("failed to update column: %w", err)
	}
	return nil
}

func (r *kanbanRepository) DeleteColumn(id string) error {
	if err := r.db.Delete(&emaildomain.KanbanColumn{}, "id = ?", id).Error; err != nil {
		return fmt.Errorf("failed to delete column: %w", err)
	}
	return nil
}

func (r *kanbanRepository) DeleteColumnsByUserID(userID string) error {
	if err := r.db.Where("user_id = ?", userID).Delete(&emaildomain.KanbanColumn{}).Error; err != nil {
		return fmt.Errorf("failed to delete columns: %w", err)
	}
	return nil
}


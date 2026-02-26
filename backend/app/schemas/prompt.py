import uuid
from datetime import datetime

from pydantic import BaseModel


class PromptTopicCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    sort_order: int = 0


class PromptTopicResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    sort_order: int
    prompt_count: int = 0

    model_config = {"from_attributes": True}


class PromptCreate(BaseModel):
    topic_id: uuid.UUID
    text: str
    language: str = "es"
    is_active: bool = True
    sort_order: int = 0
    niche_id: uuid.UUID | None = None


class PromptResponse(BaseModel):
    id: uuid.UUID
    topic_id: uuid.UUID
    niche_id: uuid.UUID | None = None
    text: str
    language: str
    is_active: bool
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PromptUpdate(BaseModel):
    text: str


class PromptBulkImport(BaseModel):
    prompts: list[PromptCreate]

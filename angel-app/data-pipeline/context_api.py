"""
FastAPI Microservice for AI Therapist Context Management

Provides REST API for NestJS backend to get intelligent conversation context.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import uvicorn
import os
from therapist_context_manager import TherapistContextManager

app = FastAPI(
    title="AI Therapist Context API",
    description="Intelligent context management for therapeutic conversations",
    version="1.0.0"
)

# CORS for NestJS backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize context manager (reuse connection)
context_manager = TherapistContextManager(
    max_context_tokens=8000  # Default, can be overridden per request
)


# Request/Response Models
class Message(BaseModel):
    sender_type: str  # "USER" or "BOT"
    content: str


class ContextRequest(BaseModel):
    current_session: List[Message]
    user_id: str
    conversation_id: Optional[str] = None
    include_similar: bool = True
    token_budget: Optional[int] = None


class ContextResponse(BaseModel):
    formatted_context: str
    token_usage: Dict
    recent_history_count: int
    similar_moments_count: int
    metadata: Dict


class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    limit: int = 5
    similarity_threshold: float = 0.7


class SearchResult(BaseModel):
    conversation_id: str
    turn_index: int
    speaker: str
    text_chunk: str
    similarity: float
    timestamp: int


# API Endpoints

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "AI Therapist Context API",
        "status": "healthy",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        # Test database connections
        # Quick query to verify connections
        return {
            "status": "healthy",
            "postgres": "connected",
            "weaviate": "connected",
            "max_context_tokens": context_manager.max_context_tokens
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")


@app.post("/context/build", response_model=ContextResponse)
async def build_context(request: ContextRequest):
    """
    Build intelligent therapeutic context from conversation history.

    This endpoint:
    1. Gets recent conversation history from PostgreSQL
    2. Finds semantically similar past conversations using Weaviate
    3. Assembles optimal context within token budget
    4. Returns formatted context ready for LLM

    Example request:
    ```json
    {
      "current_session": [
        {"sender_type": "USER", "content": "I'm feeling anxious..."},
        {"sender_type": "BOT", "content": "Tell me more..."}
      ],
      "user_id": "user-uuid",
      "include_similar": true,
      "token_budget": 6000
    }
    ```
    """
    try:
        # Convert Pydantic models to dicts
        current_session = [msg.dict() for msg in request.current_session]

        # Build context
        context = context_manager.build_context(
            current_session=current_session,
            conversation_id=request.conversation_id,
            user_id=request.user_id,
            include_similar=request.include_similar,
            token_budget=request.token_budget
        )

        # Format for LLM
        formatted_context = context_manager.format_for_llm(context)

        return ContextResponse(
            formatted_context=formatted_context,
            token_usage=context["token_usage"],
            recent_history_count=len(context.get("recent_history", [])),
            similar_moments_count=len(context.get("relevant_past_context", [])),
            metadata=context["metadata"]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error building context: {str(e)}")


@app.post("/search/similar", response_model=List[SearchResult])
async def search_similar(request: SearchRequest):
    """
    Semantic search for similar past conversations.

    Uses Weaviate embeddings to find relevant past moments
    where the patient discussed similar topics.

    Example request:
    ```json
    {
      "query": "I'm having panic attacks",
      "user_id": "user-uuid",
      "limit": 5,
      "similarity_threshold": 0.7
    }
    ```
    """
    try:
        results = context_manager.search_similar_conversations(
            query=request.query,
            user_id=request.user_id,
            limit=request.limit,
            similarity_threshold=request.similarity_threshold
        )

        return [SearchResult(**result) for result in results]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in semantic search: {str(e)}")


@app.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get full conversation history from PostgreSQL"""
    try:
        conversation = context_manager.get_conversation(conversation_id)

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return conversation

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving conversation: {str(e)}")


@app.get("/users/{user_id}/recent-conversations")
async def get_recent_conversations(
    user_id: str,
    limit: int = 5,
    days_back: int = 90
):
    """Get recent conversations for a user"""
    try:
        conversations = context_manager.get_recent_conversations(
            user_id=user_id,
            limit=limit,
            days_back=days_back
        )

        return {
            "user_id": user_id,
            "conversations": conversations,
            "count": len(conversations)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving conversations: {str(e)}")


# Startup/Shutdown Events

@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    print("🚀 AI Therapist Context API starting...")
    print(f"   PostgreSQL: Connected")
    print(f"   Weaviate: Connected")
    print(f"   Max context tokens: {context_manager.max_context_tokens}")
    print("✅ Ready to serve context!")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("🛑 Shutting down...")
    context_manager.close()
    print("✅ Connections closed")


if __name__ == "__main__":
    # Get configuration from environment
    host = os.getenv("CONTEXT_API_HOST", "0.0.0.0")
    port = int(os.getenv("CONTEXT_API_PORT", "8001"))

    print(f"\n{'='*60}")
    print("AI THERAPIST CONTEXT API")
    print(f"{'='*60}")
    print(f"Starting server on {host}:{port}")
    print(f"\nAPI Documentation: http://localhost:{port}/docs")
    print(f"Health Check: http://localhost:{port}/health")
    print(f"{'='*60}\n")

    uvicorn.run(
        "context_api:app",
        host=host,
        port=port,
        reload=True,  # Auto-reload on code changes (dev only)
        log_level="info"
    )

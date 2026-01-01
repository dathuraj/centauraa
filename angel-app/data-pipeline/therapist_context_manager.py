"""
AI Therapist Context Management System

Integrates with PostgreSQL and Weaviate infrastructure to provide
optimal conversation context for AI therapist interactions.

Features:
- Retrieves relevant conversation history from PostgreSQL
- Semantic search using Weaviate embeddings
- Token budget management
- Safety-first context prioritization
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
import weaviate
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TherapistContextManager:
    """
    Manages conversation context for AI therapist interactions.

    Uses PostgreSQL for conversation data and Weaviate for semantic search.
    """

    def __init__(
        self,
        postgres_connection_string: Optional[str] = None,
        weaviate_url: str = "http://localhost:8080",
        weaviate_api_key: Optional[str] = None,
        max_context_tokens: int = 8000
    ):
        """
        Initialize context manager with database connections.

        Args:
            postgres_connection_string: PostgreSQL connection string
            weaviate_url: Weaviate URL (http://host:port)
            weaviate_api_key: Weaviate API key (optional)
            max_context_tokens: Maximum tokens for context window
        """
        # PostgreSQL connection
        if postgres_connection_string is None:
            db_host = os.getenv("DB_HOST", "localhost")
            db_port = os.getenv("DB_PORT", "5432")
            db_name = os.getenv("DB_NAME", "postgres")
            db_user = os.getenv("DB_USER", "postgres")
            db_password = os.getenv("DB_PASSWORD", "")

            postgres_connection_string = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

        self.pg_conn = psycopg2.connect(postgres_connection_string)
        logger.info("Connected to PostgreSQL")

        # Weaviate connection
        if weaviate_api_key:
            self.weaviate_client = weaviate.Client(
                url=weaviate_url,
                auth_client_secret=weaviate.AuthApiKey(api_key=weaviate_api_key)
            )
        else:
            self.weaviate_client = weaviate.Client(url=weaviate_url)

        logger.info(f"Connected to Weaviate at {weaviate_url}")

        self.max_context_tokens = max_context_tokens

        # Token estimation: ~0.75 tokens per word for English
        self.words_per_token = 1.33

        logger.info(f"TherapistContextManager initialized with {max_context_tokens} token budget")

    def estimate_tokens(self, text: str) -> int:
        """Estimate number of tokens in text."""
        words = len(text.split())
        return int(words / self.words_per_token)

    def get_conversation(self, conversation_id: str) -> Optional[Dict]:
        """
        Retrieve full conversation from PostgreSQL.

        Args:
            conversation_id: UUID of the conversation

        Returns:
            Dictionary with conversation and messages
        """
        with self.pg_conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Get conversation
            cursor.execute("""
                SELECT c.id, c.title, c."createdAt", u.id as user_id
                FROM conversation c
                LEFT JOIN "user" u ON c."userId" = u.id
                WHERE c.id = %s
            """, (conversation_id,))

            conversation = cursor.fetchone()

            if not conversation:
                return None

            # Get messages
            cursor.execute("""
                SELECT id, "senderType", content, "createdAt"
                FROM message
                WHERE "conversationId" = %s
                ORDER BY "createdAt" ASC
            """, (conversation_id,))

            messages = cursor.fetchall()

            return {
                "id": conversation["id"],
                "title": conversation["title"],
                "created_at": conversation["createdat"],
                "user_id": conversation["user_id"],
                "messages": [
                    {
                        "id": msg["id"],
                        "sender_type": msg["sendertype"],
                        "content": msg["content"],
                        "created_at": msg["createdat"]
                    }
                    for msg in messages
                ]
            }

    def get_recent_conversations(
        self,
        user_id: str,
        limit: int = 5,
        days_back: int = 90
    ) -> List[Dict]:
        """
        Retrieve recent conversations for a user.

        Args:
            user_id: User UUID
            limit: Maximum number of conversations
            days_back: How many days back to search

        Returns:
            List of conversation summaries
        """
        cutoff_date = datetime.now() - timedelta(days=days_back)

        with self.pg_conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT c.id, c.title, c."createdAt",
                       COUNT(m.id) as message_count
                FROM conversation c
                LEFT JOIN message m ON m."conversationId" = c.id
                WHERE c."userId" = %s
                  AND c."createdAt" >= %s
                GROUP BY c.id, c.title, c."createdAt"
                ORDER BY c."createdAt" DESC
                LIMIT %s
            """, (user_id, cutoff_date, limit))

            conversations = cursor.fetchall()

            summaries = []
            for conv in conversations:
                # Get sample messages for summary
                cursor.execute("""
                    SELECT "senderType", content, "createdAt"
                    FROM message
                    WHERE "conversationId" = %s
                    ORDER BY "createdAt" ASC
                    LIMIT 10
                """, (conv["id"],))

                messages = cursor.fetchall()

                summary = self._summarize_conversation(conv, messages)
                summaries.append(summary)

            return summaries

    def _summarize_conversation(self, conversation: Dict, messages: List[Dict]) -> Dict:
        """
        Create a summary of a conversation.

        Args:
            conversation: Conversation metadata
            messages: List of messages

        Returns:
            Summarized conversation
        """
        # Extract key topics (simple keyword matching)
        all_text = " ".join([msg["content"].lower() for msg in messages])

        topic_keywords = {
            "anxiety": ["anxiety", "anxious", "worried", "nervous"],
            "depression": ["depressed", "depression", "sad", "hopeless"],
            "stress": ["stress", "stressed", "overwhelmed", "pressure"],
            "sleep": ["sleep", "insomnia", "tired", "exhausted"],
            "relationships": ["relationship", "partner", "family", "friend"],
            "work": ["work", "job", "career", "boss", "colleague"]
        }

        topics = []
        for topic, keywords in topic_keywords.items():
            if any(keyword in all_text for keyword in keywords):
                topics.append(topic)

        # Count messages by type
        user_messages = len([m for m in messages if m["sendertype"] == "USER"])
        bot_messages = len([m for m in messages if m["sendertype"] == "BOT"])

        return {
            "conversation_id": conversation["id"],
            "title": conversation["title"],
            "date": conversation["createdat"],
            "topics": topics[:5],
            "message_count": conversation["message_count"],
            "user_messages": user_messages,
            "bot_messages": bot_messages,
            "first_message_preview": messages[0]["content"][:100] if messages else ""
        }

    def search_similar_conversations(
        self,
        query: str,
        user_id: Optional[str] = None,
        limit: int = 5,
        similarity_threshold: float = 0.7
    ) -> List[Dict]:
        """
        Semantic search using Weaviate embeddings.

        Args:
            query: Search query text
            user_id: Filter by user (optional)
            limit: Maximum results
            similarity_threshold: Minimum similarity (0-1)

        Returns:
            List of relevant conversation chunks
        """
        try:
            # Use Weaviate's nearText for semantic search
            query_builder = (
                self.weaviate_client.query
                .get("ConversationEmbedding", ["conversationId", "turnIndex", "speaker", "textChunk", "timestamp"])
                .with_near_text({"concepts": [query]})
                .with_limit(limit * 2)  # Get extra to filter by threshold
                .with_additional(["distance"])
            )

            result = query_builder.do()

            if "data" not in result or "Get" not in result["data"]:
                return []

            embeddings = result["data"]["Get"]["ConversationEmbedding"] or []

            # Convert to results with similarity score
            results = []
            for item in embeddings:
                # Distance to similarity: similarity = 1 - (distance / 2)
                distance = item["_additional"]["distance"]
                similarity = 1 - (distance / 2)

                if similarity >= similarity_threshold:
                    results.append({
                        "conversation_id": item["conversationId"],
                        "turn_index": item["turnIndex"],
                        "speaker": item["speaker"],
                        "text_chunk": item["textChunk"],
                        "similarity": similarity,
                        "timestamp": item.get("timestamp", 0)
                    })

            # Sort by similarity
            results.sort(key=lambda x: x["similarity"], reverse=True)

            return results[:limit]

        except Exception as e:
            logger.error(f"Error in semantic search: {e}")
            return []

    def get_conversation_from_weaviate(self, conversation_id: str) -> List[Dict]:
        """
        Get full conversation chunks from Weaviate.

        Args:
            conversation_id: Conversation UUID

        Returns:
            List of conversation chunks sorted by turn index
        """
        try:
            result = (
                self.weaviate_client.query
                .get("ConversationEmbedding", ["conversationId", "turnIndex", "speaker", "textChunk", "timestamp"])
                .with_where({
                    "path": ["conversationId"],
                    "operator": "Equal",
                    "valueText": conversation_id
                })
                .with_limit(1000)
                .do()
            )

            if "data" not in result or "Get" not in result["data"]:
                return []

            chunks = result["data"]["Get"]["ConversationEmbedding"] or []

            # Sort by turn index
            chunks.sort(key=lambda x: x["turnIndex"])

            return chunks

        except Exception as e:
            logger.error(f"Error getting conversation from Weaviate: {e}")
            return []

    def build_context(
        self,
        current_session: List[Dict],
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        include_similar: bool = True,
        token_budget: Optional[int] = None
    ) -> Dict:
        """
        Build complete context for AI therapist with token budget management.

        Args:
            current_session: List of message dicts with 'sender_type' and 'content'
            conversation_id: Current conversation UUID
            user_id: User UUID
            include_similar: Whether to include semantically similar conversations
            token_budget: Override default token budget

        Returns:
            Structured context dictionary
        """
        if token_budget is None:
            token_budget = self.max_context_tokens

        context = {
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "token_budget": token_budget,
                "conversation_id": conversation_id,
                "user_id": user_id
            },
            "recent_history": [],
            "current_session": current_session,
            "relevant_past_context": [],
            "token_usage": {}
        }

        tokens_used = 0

        # 1. Current Session (40% of budget) - HIGHEST PRIORITY
        current_session_budget = int(token_budget * 0.40)
        current_session_text = self._format_messages(current_session)
        current_session_tokens = self.estimate_tokens(current_session_text)

        if current_session_tokens > current_session_budget:
            # Truncate older messages
            current_session = self._truncate_messages(current_session, current_session_budget)
            current_session_text = self._format_messages(current_session)
            current_session_tokens = self.estimate_tokens(current_session_text)

        context["current_session"] = current_session
        tokens_used += current_session_tokens

        # 2. Recent History (35% of budget)
        if user_id:
            history_budget = int(token_budget * 0.35)
            recent_convs = self.get_recent_conversations(
                user_id=user_id,
                limit=4,
                days_back=90
            )

            history_text = self._format_conversation_summaries(recent_convs)
            history_tokens = self.estimate_tokens(history_text)

            if history_tokens <= history_budget:
                context["recent_history"] = recent_convs
                tokens_used += history_tokens
            else:
                # Reduce number of conversations
                for i in range(len(recent_convs), 0, -1):
                    history_text = self._format_conversation_summaries(recent_convs[:i])
                    history_tokens = self.estimate_tokens(history_text)
                    if history_tokens <= history_budget:
                        context["recent_history"] = recent_convs[:i]
                        tokens_used += history_tokens
                        break

        # 3. Relevant Past Context via Semantic Search (25% of budget)
        if include_similar and current_session:
            similar_budget = int(token_budget * 0.25)

            # Use last user message for search
            last_user_msg = None
            for msg in reversed(current_session):
                if msg.get("sender_type") == "USER":
                    last_user_msg = msg.get("content", "")
                    break

            if last_user_msg:
                similar_convs = self.search_similar_conversations(
                    query=last_user_msg,
                    user_id=user_id,
                    limit=5,
                    similarity_threshold=0.7
                )

                similar_text = self._format_similar_conversations(similar_convs)
                similar_tokens = self.estimate_tokens(similar_text)

                if similar_tokens <= similar_budget:
                    context["relevant_past_context"] = similar_convs
                    tokens_used += similar_tokens
                else:
                    # Reduce number of results
                    for i in range(len(similar_convs), 0, -1):
                        similar_text = self._format_similar_conversations(similar_convs[:i])
                        similar_tokens = self.estimate_tokens(similar_text)
                        if similar_tokens <= similar_budget:
                            context["relevant_past_context"] = similar_convs[:i]
                            tokens_used += similar_tokens
                            break

        # Update token usage
        context["token_usage"] = {
            "total_used": tokens_used,
            "budget": token_budget,
            "utilization": f"{(tokens_used/token_budget)*100:.1f}%",
            "breakdown": {
                "current_session": current_session_tokens,
                "recent_history": history_tokens if user_id else 0,
                "relevant_past": similar_tokens if include_similar and current_session else 0
            }
        }

        return context

    def format_for_llm(self, context: Dict) -> str:
        """
        Format context dictionary into LLM prompt string.

        Args:
            context: Context from build_context()

        Returns:
            Formatted prompt string
        """
        sections = []

        sections.append("=== THERAPEUTIC CONTEXT ===\n")

        # Recent History
        if context.get("recent_history"):
            sections.append("=== RECENT CONVERSATION HISTORY ===")
            for i, conv in enumerate(context["recent_history"], 1):
                date = conv.get("date")
                if isinstance(date, datetime):
                    date = date.strftime("%Y-%m-%d")

                sections.append(f"\nSession {i} ({date}):")
                if conv.get("title"):
                    sections.append(f"  Title: {conv['title']}")
                if conv.get("topics"):
                    sections.append(f"  Topics: {', '.join(conv['topics'])}")
                sections.append(f"  Messages: {conv.get('message_count', 0)}")
                if conv.get("first_message_preview"):
                    sections.append(f"  Started with: {conv['first_message_preview']}...")
            sections.append("")

        # Relevant Past Context
        if context.get("relevant_past_context"):
            sections.append("=== RELEVANT PAST MOMENTS ===")
            sections.append("(Similar situations from past conversations)\n")
            for i, past in enumerate(context["relevant_past_context"], 1):
                similarity_pct = f"{past.get('similarity', 0) * 100:.0f}%"
                sections.append(f"{i}. [{similarity_pct} relevant]")
                sections.append(f"   {past.get('text_chunk', '')[:200]}...")
                sections.append("")

        # Current Session
        if context.get("current_session"):
            sections.append("=== CURRENT SESSION ===")
            sections.append(self._format_messages(context["current_session"]))
            sections.append("")

        # Token usage
        if context.get("token_usage"):
            usage = context["token_usage"]
            sections.append(f"[Context: {usage['total_used']}/{usage['budget']} tokens ({usage['utilization']})]")

        return "\n".join(sections)

    def _format_messages(self, messages: List[Dict]) -> str:
        """Format messages into readable text."""
        formatted = []
        for msg in messages:
            sender = msg.get("sender_type", "UNKNOWN")
            # Normalize sender names
            if sender == "USER":
                speaker = "Patient"
            elif sender == "BOT":
                speaker = "Therapist"
            else:
                speaker = sender

            content = msg.get("content", "")
            formatted.append(f"[{speaker}]: {content}")

        return "\n".join(formatted)

    def _format_conversation_summaries(self, summaries: List[Dict]) -> str:
        """Format conversation summaries."""
        lines = []
        for summary in summaries:
            lines.append(f"Date: {summary.get('date')}")
            lines.append(f"Topics: {', '.join(summary.get('topics', []))}")
            lines.append(f"Messages: {summary.get('message_count', 0)}")
        return "\n".join(lines)

    def _format_similar_conversations(self, similar: List[Dict]) -> str:
        """Format similar conversation results."""
        lines = []
        for item in similar:
            lines.append(f"[{item.get('similarity', 0):.2f}] {item.get('text_chunk', '')[:200]}")
        return "\n".join(lines)

    def _truncate_messages(self, messages: List[Dict], token_budget: int) -> List[Dict]:
        """Truncate messages to fit token budget, keeping most recent."""
        truncated = []
        tokens = 0

        # Start from most recent
        for msg in reversed(messages):
            msg_text = self._format_messages([msg])
            msg_tokens = self.estimate_tokens(msg_text)

            if tokens + msg_tokens <= token_budget:
                truncated.insert(0, msg)
                tokens += msg_tokens
            else:
                break

        return truncated

    def close(self):
        """Close database connections."""
        if self.pg_conn:
            self.pg_conn.close()
        logger.info("Connections closed")

"""
Simple Usage Example: AI Therapist Context Manager

Quick examples showing how to use the context manager with PostgreSQL + Weaviate.
"""

from therapist_context_manager import TherapistContextManager


def example_basic():
    """Basic example: Build context for current session"""
    print("=" * 70)
    print("EXAMPLE: Building Context for AI Therapist")
    print("=" * 70)

    # Initialize (uses environment variables for DB connections)
    manager = TherapistContextManager(
        max_context_tokens=6000  # 6K token budget
    )

    # Simulate current conversation
    current_session = [
        {
            "sender_type": "USER",
            "content": "I've been feeling really anxious about work lately."
        },
        {
            "sender_type": "BOT",
            "content": "I hear that you're feeling overwhelmed. Can you tell me more about what's causing the anxiety?"
        },
        {
            "sender_type": "USER",
            "content": "My manager keeps giving me more tasks and I can't keep up. I haven't been sleeping well."
        }
    ]

    # Build context
    context = manager.build_context(
        current_session=current_session,
        user_id="550e8400-e29b-41d4-a716-446655440000",  # Example UUID
        include_similar=True  # Include semantically similar past conversations
    )

    # Show results
    print("\n✅ Context Built Successfully!")
    print(f"\nToken Usage: {context['token_usage']['utilization']}")
    print(f"  Current session: {context['token_usage']['breakdown']['current_session']} tokens")
    print(f"  Recent history: {context['token_usage']['breakdown']['recent_history']} tokens")
    print(f"  Similar past: {context['token_usage']['breakdown']['relevant_past']} tokens")

    print(f"\nRecent conversations found: {len(context['recent_history'])}")
    print(f"Similar past moments found: {len(context['relevant_past_context'])}")

    # Format for LLM
    llm_prompt = manager.format_for_llm(context)

    print("\n" + "-" * 70)
    print("LLM-READY PROMPT (First 500 chars):")
    print("-" * 70)
    print(llm_prompt[:500] + "...\n")

    manager.close()


def example_semantic_search():
    """Example: Search for similar past conversations"""
    print("\n" + "=" * 70)
    print("EXAMPLE: Semantic Search for Similar Conversations")
    print("=" * 70)

    manager = TherapistContextManager()

    query = "I'm having panic attacks and can't sleep"

    print(f"\nSearching for: '{query}'")
    print("Looking for similar past experiences...")

    results = manager.search_similar_conversations(
        query=query,
        limit=5,
        similarity_threshold=0.7  # 70% similarity minimum
    )

    print(f"\n✅ Found {len(results)} relevant past moments:\n")

    for i, result in enumerate(results, 1):
        print(f"{i}. Similarity: {result['similarity']*100:.0f}%")
        print(f"   Speaker: {result['speaker']}")
        print(f"   Text: {result['text_chunk'][:120]}...")
        print()

    manager.close()


def example_get_conversation_history():
    """Example: Retrieve specific conversation history"""
    print("\n" + "=" * 70)
    print("EXAMPLE: Get Full Conversation History")
    print("=" * 70)

    manager = TherapistContextManager()

    conversation_id = "your-conversation-uuid-here"

    print(f"\nRetrieving conversation: {conversation_id[:20]}...")

    # Get from PostgreSQL
    conv = manager.get_conversation(conversation_id)

    if conv:
        print(f"\n✅ Found conversation:")
        print(f"   Title: {conv.get('title', 'Untitled')}")
        print(f"   Messages: {len(conv['messages'])}")
        print(f"   Created: {conv['created_at']}")

        print("\n   First 3 messages:")
        for msg in conv['messages'][:3]:
            sender = "Patient" if msg['sender_type'] == "USER" else "Therapist"
            print(f"   [{sender}]: {msg['content'][:80]}...")
    else:
        print(f"\n❌ Conversation not found")

    manager.close()


def example_integration_with_openai():
    """Example: Complete integration with OpenAI"""
    print("\n" + "=" * 70)
    print("EXAMPLE: Integration with OpenAI API")
    print("=" * 70)

    manager = TherapistContextManager(max_context_tokens=6000)

    # Current session
    current_session = [
        {
            "sender_type": "USER",
            "content": "I tried the breathing exercises from last week and they really helped!"
        }
    ]

    # Build context
    context = manager.build_context(
        current_session=current_session,
        user_id="550e8400-e29b-41d4-a716-446655440000",
        include_similar=True
    )

    # Format for LLM
    context_prompt = manager.format_for_llm(context)

    # System prompt for therapist
    system_prompt = """You are a compassionate and professional AI therapist.

Guidelines:
- Prioritize patient safety always
- Use evidence-based therapeutic approaches (CBT, DBT)
- Be warm, empathetic, and non-judgmental
- Reference past progress when relevant
- If patient mentions self-harm or suicidal thoughts, assess risk immediately
"""

    print("\n📝 Prompt ready for OpenAI API")
    print(f"   Total estimated tokens: {manager.estimate_tokens(system_prompt + context_prompt)}")

    # Example OpenAI call (commented out - add your API key to use)
    """
    from openai import OpenAI
    import os

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": context_prompt}
        ],
        temperature=0.7,
        max_tokens=500
    )

    print("\n💬 Therapist Response:")
    print(response.choices[0].message.content)
    """

    print("\n✅ Ready to call OpenAI API (uncomment code above to use)")

    manager.close()


if __name__ == "__main__":
    print("\n🧠 AI THERAPIST CONTEXT MANAGER - SIMPLE EXAMPLES\n")

    try:
        # Run examples
        example_basic()
        example_semantic_search()
        # example_get_conversation_history()  # Uncomment when you have a real conversation ID
        example_integration_with_openai()

        print("\n" + "=" * 70)
        print("✅ All examples completed!")
        print("=" * 70)
        print("\nNext steps:")
        print("1. Set up your .env file with database credentials")
        print("2. Replace example UUIDs with real conversation/user IDs")
        print("3. Integrate with your chat service")
        print("\n")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nMake sure:")
        print("- PostgreSQL is running and accessible")
        print("- Weaviate is running")
        print("- .env file has correct credentials")
        print("- Database has conversation data")
        import traceback
        traceback.print_exc()

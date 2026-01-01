"""
Example Usage: AI Therapist Context Management

Demonstrates how to use the TherapistContextManager with the
existing embeddings infrastructure.
"""

from therapist_context_manager import TherapistContextManager
import json


def example_1_basic_context():
    """Example 1: Build basic context for a therapy session"""
    print("=" * 60)
    print("Example 1: Basic Context Building")
    print("=" * 60)

    # Initialize context manager
    manager = TherapistContextManager(
        max_context_tokens=8000  # 8K token budget
    )

    # Simulate current session messages
    current_session = [
        {
            "speaker": "Patient",
            "message": "I've been feeling really anxious about work lately. My manager keeps piling on more tasks.",
            "timestamp": "2025-12-16T10:00:00Z"
        },
        {
            "speaker": "Therapist",
            "message": "I hear that you're feeling overwhelmed with your workload. Can you tell me more about what specifically is causing the anxiety?",
            "timestamp": "2025-12-16T10:01:00Z"
        },
        {
            "speaker": "Patient",
            "message": "It's like I can never catch up. Every time I finish something, three more things appear. I can't sleep because I'm thinking about all the unfinished work.",
            "timestamp": "2025-12-16T10:02:00Z"
        }
    ]

    # Build context
    context = manager.build_context(
        current_session=current_session,
        conversation_id=None,  # No historical data for this example
        patient_id="patient_123",
        include_similar=False  # Disable for basic example
    )

    # Format for LLM
    llm_prompt = manager.format_for_llm(context)

    print("\n--- Context Built ---")
    print(f"Tokens used: {context['token_usage']['total_used']}/{context['token_usage']['budget']}")
    print(f"Utilization: {context['token_usage']['utilization']}")

    print("\n--- LLM-Ready Prompt ---")
    print(llm_prompt)

    manager.close()


def example_2_with_history():
    """Example 2: Build context with conversation history"""
    print("\n" + "=" * 60)
    print("Example 2: Context with Historical Data")
    print("=" * 60)

    manager = TherapistContextManager(max_context_tokens=8000)

    # Current session
    current_session = [
        {
            "speaker": "Patient",
            "message": "I tried the breathing exercises you suggested last week, and they actually helped!",
            "timestamp": "2025-12-16T10:00:00Z"
        },
        {
            "speaker": "Therapist",
            "message": "That's wonderful to hear! Tell me more about when you used them.",
            "timestamp": "2025-12-16T10:01:00Z"
        },
        {
            "speaker": "Patient",
            "message": "I used them before my presentation at work. I was panicking, but after 5 minutes of deep breathing, I felt calmer.",
            "timestamp": "2025-12-16T10:02:00Z"
        }
    ]

    # Build context with historical lookup
    # Note: This will search MongoDB for actual historical data
    context = manager.build_context(
        current_session=current_session,
        patient_id="patient_123",
        include_similar=True  # Include semantically similar past moments
    )

    print("\n--- Context with History ---")
    print(f"Recent sessions found: {len(context.get('recent_history', []))}")
    print(f"Relevant past moments: {len(context.get('relevant_past_context', []))}")
    print(f"Total tokens: {context['token_usage']['total_used']}")

    # Show breakdown
    breakdown = context['token_usage']['breakdown']
    print("\n--- Token Breakdown ---")
    for component, tokens in breakdown.items():
        print(f"  {component}: {tokens} tokens")

    manager.close()


def example_3_crisis_context():
    """Example 3: High-priority safety context for crisis situations"""
    print("\n" + "=" * 60)
    print("Example 3: Crisis Situation - Safety First")
    print("=" * 60)

    manager = TherapistContextManager(max_context_tokens=8000)

    # Crisis session
    current_session = [
        {
            "speaker": "Patient",
            "message": "I don't know if I can keep going. Everything feels hopeless.",
            "timestamp": "2025-12-16T10:00:00Z"
        },
        {
            "speaker": "Therapist",
            "message": "I'm really concerned about what you just shared. Are you thinking about hurting yourself?",
            "timestamp": "2025-12-16T10:01:00Z"
        },
        {
            "speaker": "Patient",
            "message": "Sometimes I think about it, but I haven't made any plans.",
            "timestamp": "2025-12-16T10:02:00Z"
        }
    ]

    # Build context - clinical profile will be prioritized
    context = manager.build_context(
        current_session=current_session,
        conversation_id="crisis_conv_123",  # Would have clinical data
        patient_id="patient_123",
        include_similar=True
    )

    # In a real system, the clinical profile would show:
    # - Crisis level: HIGH
    # - Suicidal content: YES
    # - Safety plan details

    print("\n--- Crisis Context ---")
    print("⚠️  SAFETY-CRITICAL INFORMATION PRIORITIZED")
    print(f"Clinical profile included: {bool(context.get('clinical_profile'))}")

    if context.get('clinical_profile'):
        profile = context['clinical_profile']
        risk = profile.get('risk_assessment', {})
        print(f"\nRisk Assessment:")
        print(f"  Crisis Level: {risk.get('crisis_level', 'unknown').upper()}")
        print(f"  Suicidal Content: {risk.get('suicidal_content')}")
        print(f"  Self-Harm Content: {risk.get('self_harm_content')}")

    manager.close()


def example_4_semantic_search():
    """Example 4: Find similar past conversations using embeddings"""
    print("\n" + "=" * 60)
    print("Example 4: Semantic Search for Relevant History")
    print("=" * 60)

    manager = TherapistContextManager(max_context_tokens=8000)

    # Patient mentions anxiety about public speaking
    query = "I'm terrified of giving presentations at work. My heart races and I feel like I can't breathe."

    print(f"\nSearching for similar past experiences...")
    print(f"Query: '{query[:80]}...'")

    # Search for similar situations where patient made progress
    similar_results = manager.search_similar_conversations(
        query=query,
        patient_id="patient_123",
        limit=5,
        outcome_filter=["positive", "breakthrough", "improved"]
    )

    print(f"\nFound {len(similar_results)} relevant past moments:")

    for i, result in enumerate(similar_results, 1):
        print(f"\n{i}. Relevance: {(1 - result['distance']):.2%}")
        print(f"   Text: {result['text_chunk'][:150]}...")
        print(f"   Outcome: {result['clinical_context']['outcome']}")

        if result['clinical_context']['coping_strategies']:
            print(f"   Strategies that helped: {', '.join(result['clinical_context']['coping_strategies'][:3])}")

    manager.close()


def example_5_real_integration():
    """Example 5: Real integration with OpenAI or other LLM"""
    print("\n" + "=" * 60)
    print("Example 5: Integration with LLM (OpenAI Example)")
    print("=" * 60)

    manager = TherapistContextManager(max_context_tokens=6000)

    # Build context
    current_session = [
        {
            "speaker": "Patient",
            "message": "I've been doing better with my anxiety, but I'm still struggling with sleep.",
            "timestamp": "2025-12-16T10:00:00Z"
        }
    ]

    context = manager.build_context(
        current_session=current_session,
        patient_id="patient_123",
        include_similar=True
    )

    # Format for LLM
    context_prompt = manager.format_for_llm(context)

    # System prompt for AI therapist
    system_prompt = """You are an empathetic and professional AI therapist.
Your role is to provide supportive, evidence-based therapeutic responses.

Key Guidelines:
- ALWAYS prioritize patient safety
- If patient mentions self-harm or suicidal thoughts, immediately assess risk
- Use evidence-based techniques (CBT, DBT, motivational interviewing)
- Be warm, empathetic, and non-judgmental
- Reference past progress and coping strategies when relevant
- Maintain therapeutic boundaries

Remember: You are a support tool, not a replacement for human therapists."""

    # Complete prompt (this would go to OpenAI, Claude, etc.)
    complete_prompt = f"""{system_prompt}

{context_prompt}

Please provide a therapeutic response to the patient's last message."""

    print("\n--- Complete LLM Prompt ---")
    print(f"Total length: {len(complete_prompt)} characters")
    print(f"Estimated tokens: {manager.estimate_tokens(complete_prompt)}")

    print("\n--- Prompt Preview ---")
    print(complete_prompt[:500] + "...\n")

    # Example of how you'd call OpenAI (commented out)
    """
    from openai import OpenAI

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": context_prompt + "\n\nPlease respond to the patient."}
        ],
        temperature=0.7,
        max_tokens=500
    )

    therapist_response = response.choices[0].message.content
    print(f"\nTherapist: {therapist_response}")
    """

    manager.close()


def example_6_token_budgeting():
    """Example 6: Different token budgets for different scenarios"""
    print("\n" + "=" * 60)
    print("Example 6: Token Budget Management")
    print("=" * 60)

    scenarios = [
        ("Quick check-in", 2000),
        ("Standard session", 6000),
        ("Deep dive session", 12000),
        ("Crisis intervention", 8000)  # More context for safety
    ]

    current_session = [
        {
            "speaker": "Patient",
            "message": "How should I handle my work stress?",
            "timestamp": "2025-12-16T10:00:00Z"
        }
    ]

    for scenario_name, token_budget in scenarios:
        manager = TherapistContextManager(max_context_tokens=token_budget)

        context = manager.build_context(
            current_session=current_session,
            patient_id="patient_123",
            include_similar=True
        )

        print(f"\n{scenario_name} ({token_budget} tokens):")
        print(f"  Utilization: {context['token_usage']['utilization']}")
        print(f"  Recent sessions: {len(context.get('recent_history', []))}")
        print(f"  Relevant past: {len(context.get('relevant_past_context', []))}")

        manager.close()


if __name__ == "__main__":
    print("\n" + "🧠 AI THERAPIST CONTEXT MANAGEMENT EXAMPLES" + "\n")

    try:
        # Run all examples
        example_1_basic_context()
        example_2_with_history()
        example_3_crisis_context()
        example_4_semantic_search()
        example_5_real_integration()
        example_6_token_budgeting()

        print("\n" + "=" * 60)
        print("✅ All examples completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error running examples: {e}")
        import traceback
        traceback.print_exc()

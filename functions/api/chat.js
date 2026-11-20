
export async function onRequestPost({ request, env }) {
  try {
    const { business_id, message, history = [] } = await request.json();

    if (!business_id || !message || typeof message !== "string") {
      return Response.json({ error: "Business ID and message are required." }, { status: 400 });
    }

    if (message.length > 4000) {
      return Response.json({ error: "Message is too long." }, { status: 400 });
    }

    const auth = request.headers.get("Authorization");

    if (!auth?.startsWith("Bearer ")) {
      return Response.json({ error: "Please sign in first." }, { status: 401 });
    }

    const headers = {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: auth
    };

    const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });

    if (!userResponse.ok) {
      return Response.json({ error: "Invalid login session." }, { status: 401 });
    }

    const user = await userResponse.json();

    const businessResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(business_id)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id,business_name,description`,
      { headers }
    );

    if (!businessResponse.ok) {
      return Response.json({ error: "Could not verify business." }, { status: 403 });
    }

    const businesses = await businessResponse.json();

    if (!businesses.length) {
      return Response.json({ error: "Business not found or access denied." }, { status: 403 });
    }

    const chatbotResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/chatbots?business_id=eq.${encodeURIComponent(business_id)}&select=bot_name,business_information,is_active`,
      { headers }
    );

    if (!chatbotResponse.ok) {
      return Response.json({ error: "Could not load chatbot settings." }, { status: 500 });
    }

    const chatbots = await chatbotResponse.json();
    const bot = chatbots[0];

    if (!bot || !bot.is_active) {
      return Response.json({ error: "Chatbot is not active." }, { status: 404 });
    }

    const business = businesses[0];

    const systemPrompt = `
You are ${bot.bot_name}, an intelligent assistant powered by STREZLESS AI.

BUSINESS: ${business.business_name}
DESCRIPTION: ${business.description || "Not provided"}
BUSINESS KNOWLEDGE: ${bot.business_information || "Not provided"}

PERSONALITY:
- Be intelligent, creative, friendly and professional.
- Think carefully and explain things clearly.
- Help customers solve problems and explore ideas.
- Answer in the language used by the customer.
- Never invent business prices, policies, opening hours or contact details.
- If information is missing, say so honestly.
- Distinguish creative suggestions from verified business facts.
`;

    const safeHistory = Array.isArray(history)
      ? history.filter(item =>
          item &&
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string"
        ).slice(-10)
      : [];

    const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
      messages: [
        { role: "system", content: systemPrompt },
        ...safeHistory,
        { role: "user", content: message }
      ],
      max_tokens: 1000,
      temperature: 0.8
    });

    return Response.json({
      success: true,
      chatbot_name: bot.bot_name,
      reply: result.response || "I could not generate a response."
    });

  
} catch (error) {
    console.error("STREZLESS AI ERROR:", error);

    return Response.json({
      success: false,
      error: error.message || "Unknown AI service error."
    }, { status: 500 });
  }
}

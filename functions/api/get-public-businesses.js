
export async function onRequestGet({ env }) {
  try {
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return Response.json(
        { success: false, error: "Server configuration is incomplete." },
        { status: 500 }
      );
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    };

    // Get only registered businesses that are active
    const businessResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/businesses?select=id,business_name,description&is_active=eq.true&order=business_name.asc`,
      { headers }
    );

    if (!businessResponse.ok) {
      return Response.json(
        { success: false, error: "Could not load businesses." },
        { status: 500 }
      );
    }

    const businesses = await businessResponse.json();

    // Get businesses with active chatbots
    const chatbotResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/chatbots?select=business_id&is_active=eq.true`,
      { headers }
    );

    if (!chatbotResponse.ok) {
      return Response.json(
        { success: false, error: "Could not verify active chatbots." },
        { status: 500 }
      );
    }

    const chatbots = await chatbotResponse.json();

    const activeBusinessIds = new Set(
      chatbots.map((bot) => bot.business_id)
    );

    // Include only businesses that are active
    // and have an active chatbot
    const publicBusinesses = businesses
      .filter((business) => activeBusinessIds.has(business.id))
      .map((business) => ({
        id: business.id,
        business_name: business.business_name,
        description: business.description
      }));

    return Response.json(
      {
        success: true,
        businesses: publicBusinesses
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Public business loading error:", error);

    return Response.json(
      {
        success: false,
        error: "An unexpected server error occurred."
      },
      { status: 500 }
    );
  }
}

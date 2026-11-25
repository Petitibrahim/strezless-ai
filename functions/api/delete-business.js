export async function onRequestPost({ request, env }) {
  try {
    const authorization = request.headers.get("Authorization");

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return Response.json(
        { success: false, error: "Please log in first." },
        { status: 401 }
      );
    }

    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_ANON_KEY ||
      !env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return Response.json(
        { success: false, error: "Server configuration is incomplete." },
        { status: 500 }
      );
    }

    // Verify logged-in user
    const userResponse = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: authorization
        }
      }
    );

    if (!userResponse.ok) {
      return Response.json(
        { success: false, error: "Invalid login session." },
        { status: 401 }
      );
    }

    const user = await userResponse.json();
    const body = await request.json();

    const businessId =
      typeof body.business_id === "string"
        ? body.business_id
        : "";

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(businessId)) {
      return Response.json(
        { success: false, error: "Invalid business information." },
        { status: 400 }
      );
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

    // Verify business ownership and retrieve its name
    const businessResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(businessId)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id,business_name`,
      { headers }
    );

    if (!businessResponse.ok) {
      return Response.json(
        { success: false, error: "Could not verify business ownership." },
        { status: 500 }
      );
    }

    const businesses = await businessResponse.json();

    if (!businesses.length) {
      return Response.json(
        { success: false, error: "You do not have access to this business." },
        { status: 403 }
      );
    }

    const business = businesses[0];

    // Preserve business name, owner and detach historical enquiries
const enquiriesResponse = await fetch(
  `${env.SUPABASE_URL}/rest/v1/customer_enquiries?business_id=eq.${encodeURIComponent(businessId)}`,
  {
    method: "PATCH",
    headers: {
      ...headers,
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      business_name: business.business_name,
      business_owner_id: user.id,
      business_id: null
    })
  }
);

    if (!enquiriesResponse.ok) {
      return Response.json(
        { success: false, error: "Could not preserve customer enquiries. Business was not deleted." },
        { status: 500 }
      );
    }

    // Delete the business owned by the authenticated user
    const deleteResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(businessId)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "DELETE",
        headers: {
          ...headers,
          Prefer: "return=representation"
        }
      }
    );

    if (!deleteResponse.ok) {
      return Response.json(
        { success: false, error: "Customer enquiries were preserved, but the business could not be deleted." },
        { status: 500 }
      );
    }

    const deletedBusinesses = await deleteResponse.json();

    if (!deletedBusinesses.length) {
      return Response.json(
        { success: false, error: "Business was not deleted." },
        { status: 404 }
      );
    }

    return Response.json(
      {
        success: true,
        message: "Business permanently deleted. Historical customer enquiries have been preserved.",
        business_name: business.business_name
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Business deletion error:", error);

    return Response.json(
      {
        success: false,
        error: "An unexpected server error occurred."
      },
      { status: 500 }
    );
  }
}
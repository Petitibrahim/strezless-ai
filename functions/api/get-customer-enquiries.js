
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

    // Verify the logged-in user
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
      typeof body.business_id === "string" ? body.business_id : "";

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(businessId)) {
      return Response.json(
        { success: false, error: "Invalid business ID." },
        { status: 400 }
      );
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    };

    // Confirm that this business belongs to the logged-in user
    const businessResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(businessId)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id`,
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

    // Load only enquiries belonging to this business
    const enquiryResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_enquiries?business_id=eq.${encodeURIComponent(businessId)}&select=id,business_id,customer_name,customer_contact,service_requested,project_description,project_budget,enquiry_status,created_at&order=created_at.desc&limit=100`,
      { headers }
    );

    if (!enquiryResponse.ok) {
      return Response.json(
        { success: false, error: "Could not load customer enquiries." },
        { status: 500 }
      );
    }

    const enquiries = await enquiryResponse.json();

    return Response.json(
      {
        success: true,
        enquiries
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Customer enquiries loading error:", error);

    return Response.json(
      {
        success: false,
        error: "An unexpected server error occurred."
      },
      { status: 500 }
    );
  }
}

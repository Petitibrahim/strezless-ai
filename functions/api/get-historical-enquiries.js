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

    // Retrieve only historical enquiries belonging to this owner
    const enquiriesResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_enquiries?business_owner_id=eq.${encodeURIComponent(user.id)}&business_id=is.null&select=id,created_at,customer_name,customer_contact,service_requested,project_description,project_budget,enquiry_status,business_name&order=created_at.desc&limit=100`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!enquiriesResponse.ok) {
      return Response.json(
        { success: false, error: "Could not load historical enquiries." },
        { status: 500 }
      );
    }

    const enquiries = await enquiriesResponse.json();

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
    console.error("Historical enquiries error:", error);

    return Response.json(
      {
        success: false,
        error: "An unexpected server error occurred."
      },
      { status: 500 }
    );
  }
}
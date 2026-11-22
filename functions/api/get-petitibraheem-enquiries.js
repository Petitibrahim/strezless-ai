
export async function onRequestGet({ request, env }) {
  try {
    const authorization = request.headers.get("Authorization");

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return Response.json(
        { error: "Please log in first." },
        { status: 401 }
      );
    }

    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_ANON_KEY ||
      !env.SUPABASE_SERVICE_ROLE_KEY ||
      !env.PETITIBRAHEEM_OWNER_ID
    ) {
      return Response.json(
        { error: "Server configuration is incomplete." },
        { status: 500 }
      );
    }

    const headers = {
      "apikey": env.SUPABASE_ANON_KEY,
      "Authorization": authorization
    };

    // Verify the logged-in Supabase user.
    const userResponse = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      { headers }
    );

    if (!userResponse.ok) {
      return Response.json(
        { error: "Invalid login session." },
        { status: 401 }
      );
    }

    const user = await userResponse.json();

    // Only the configured Petitibraheem owner can access enquiries.
    if (user.id !== env.PETITIBRAHEEM_OWNER_ID) {
      return Response.json(
        { error: "Access denied." },
        { status: 403 }
      );
    }

    // Retrieve enquiries using the server-side service role key.
    const enquiryResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/petitibraheem_enquiries?select=id,created_at,customer_name,customer_contact,service_requested,project_description,project_budget,consent_given,enquiry_status&order=created_at.desc`,
      {
        headers: {
          "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!enquiryResponse.ok) {
      return Response.json(
        { error: "Could not load enquiries." },
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
    return Response.json(
      { error: "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}

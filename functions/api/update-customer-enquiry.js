
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

    const enquiryId =
      typeof body.id === "string" ? body.id : "";

    const businessId =
      typeof body.business_id === "string" ? body.business_id : "";

    const status =
      typeof body.enquiry_status === "string"
        ? body.enquiry_status
        : "";

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const allowedStatuses = [
      "new",
      "contacted",
      "in_progress",
      "completed"
    ];

    if (
      !uuidPattern.test(enquiryId) ||
      !uuidPattern.test(businessId) ||
      !allowedStatuses.includes(status)
    ) {
      return Response.json(
        { success: false, error: "Invalid enquiry information." },
        { status: 400 }
      );
    }

    const headers = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

    // Verify business ownership
    const businessResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(businessId)}&owner_id=eq.${encodeURIComponent(user.id)}&select=id`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
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

    // Update only an enquiry belonging to this business
    const updateResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_enquiries?id=eq.${encodeURIComponent(enquiryId)}&business_id=eq.${encodeURIComponent(businessId)}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          enquiry_status: status
        })
      }
    );

    if (!updateResponse.ok) {
      return Response.json(
        { success: false, error: "Could not update enquiry status." },
        { status: 500 }
      );
    }

    const updated = await updateResponse.json();

    if (!updated.length) {
      return Response.json(
        { success: false, error: "Enquiry not found for this business." },
        { status: 404 }
      );
    }

    return Response.json(
      {
        success: true,
        enquiry: updated[0]
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Customer enquiry update error:", error);

    return Response.json(
      {
        success: false,
        error: "An unexpected server error occurred."
      },
      { status: 500 }
    );
  }
}


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

    // Read update request
    const body = await request.json();
    const { id, enquiry_status } = body;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!id || !uuidPattern.test(id)) {
      return Response.json(
        { success: false, error: "Invalid enquiry ID." },
        { status: 400 }
      );
    }

    const allowedStatuses = [
      "new",
      "contacted",
      "in_progress",
      "completed"
    ];

    if (!allowedStatuses.includes(enquiry_status)) {
      return Response.json(
        { success: false, error: "Invalid enquiry status." },
        { status: 400 }
      );
    }

    // Update only this owner's historical enquiry
    const updateResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_enquiries?id=eq.${encodeURIComponent(id)}&business_owner_id=eq.${encodeURIComponent(user.id)}&business_id=is.null&select=id`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          enquiry_status
        })
      }
    );

    if (!updateResponse.ok) {
      return Response.json(
        { success: false, error: "Could not update historical enquiry." },
        { status: 500 }
      );
    }

    const updatedEnquiries = await updateResponse.json();

    if (!updatedEnquiries || updatedEnquiries.length === 0) {
      return Response.json(
        {
          success: false,
          error: "Historical enquiry not found or you do not have permission."
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      message: "Historical enquiry status updated successfully."
    });

  } catch (error) {
    console.error("Historical enquiry update error:", error);

    return Response.json(
      {
        success: false,
        error: "An unexpected server error occurred."
      },
      { status: 500 }
    );
  }
}

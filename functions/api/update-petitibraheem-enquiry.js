export async function onRequestPost({ request, env }) {
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

    const authResponse = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: authorization
        }
      }
    );

    if (!authResponse.ok) {
      return Response.json(
        { error: "Invalid login session." },
        { status: 401 }
      );
    }

    const user = await authResponse.json();

    if (user.id !== env.PETITIBRAHEEM_OWNER_ID) {
      return Response.json(
        { error: "Access denied." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const id = typeof body.id === "string" ? body.id : "";
    const status =
      typeof body.enquiry_status === "string"
        ? body.enquiry_status
        : "";

    const allowedStatuses = [
      "new",
      "contacted",
      "in_progress",
      "completed"
    ];

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      !allowedStatuses.includes(status)
    ) {
      return Response.json(
        { error: "Invalid enquiry ID or status." },
        { status: 400 }
      );
    }

    const updateResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/petitibraheem_enquiries?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          enquiry_status: status
        })
      }
    );

    if (!updateResponse.ok) {
      return Response.json(
        { error: "Could not update enquiry status." },
        { status: 500 }
      );
    }

    const updated = await updateResponse.json();

    if (!updated.length) {
      return Response.json(
        { error: "Enquiry not found." },
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
    return Response.json(
      { error: "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}
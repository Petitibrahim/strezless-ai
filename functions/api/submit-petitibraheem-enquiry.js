
export async function onRequestPost({ request, env }) {
  try {
    const {
      customer_name,
      customer_contact,
      service_requested,
      project_description,
      project_budget,
      consent_given,
      turnstile_token
    } = await request.json();

    // Validate required fields
    if (
      typeof customer_name !== "string" ||
      typeof customer_contact !== "string" ||
      typeof service_requested !== "string" ||
      typeof project_description !== "string" ||
      customer_name.trim().length < 2 ||
      customer_name.length > 100 ||
      customer_contact.trim().length < 3 ||
      customer_contact.length > 200 ||
      service_requested.trim().length < 2 ||
      service_requested.length > 150 ||
      !project_description.trim() ||
      project_description.length > 3000 ||
      (project_budget !== undefined &&
        (typeof project_budget !== "string" ||
          project_budget.length > 100))
    ) {
      return Response.json({
        success: false,
        error: "Please provide valid enquiry details."
      }, { status: 400 });
    }

    // Require customer consent
    if (consent_given !== true) {
      return Response.json({
        success: false,
        error: "Customer consent is required."
      }, { status: 400 });
    }

    // Verify Turnstile
    if (
      typeof turnstile_token !== "string" ||
      !turnstile_token ||
      !env.TURNSTILE_SECRET_KEY
    ) {
      return Response.json({
        success: false,
        error: "Security verification is required."
      }, { status: 400 });
    }

    const turnstileData = new FormData();
    turnstileData.append("secret", env.TURNSTILE_SECRET_KEY);
    turnstileData.append("response", turnstile_token);

    const turnstileResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: turnstileData
      }
    );

    const turnstileResult = await turnstileResponse.json();

    if (
      !turnstileResponse.ok ||
      !turnstileResult.success ||
      turnstileResult.hostname !== "strezless-ai.pages.dev"
    ) {
      return Response.json({
        success: false,
        error: "Security verification failed. Please try again."
      }, { status: 403 });
    }

    // Check Supabase configuration
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("Server configuration is missing.");
    }

    const supabaseHeaders = {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    };

    // Save enquiry in Petitibraheem's separate table
    const saveResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/petitibraheem_enquiries`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          customer_name: customer_name.trim(),
          customer_contact: customer_contact.trim(),
          service_requested: service_requested.trim(),
          project_description: project_description.trim(),
          project_budget: (project_budget || "").trim(),
          consent_given: true
        })
      }
    );

    if (!saveResponse.ok) {
      console.error(
        "Petitibraheem enquiry save failed:",
        await saveResponse.text()
      );

      throw new Error("Could not save your enquiry.");
    }

    return Response.json({
      success: true,
      message: "Your enquiry has been submitted successfully."
    });

  } catch (error) {
    console.error("Petitibraheem enquiry error:", error);

    return Response.json({
      success: false,
      error: "Something went wrong. Please try again later."
    }, { status: 500 });
  }
}

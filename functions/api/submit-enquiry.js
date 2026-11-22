
export async function onRequestPost({ request, env }) {
  try {
    const {
      business_id,
      customer_name,
      customer_contact,
      service_requested,
      project_description,
      project_budget,
      consent_given
    } = await request.json();

    // Check required information
    if (
      !business_id ||
      !customer_name ||
      !customer_contact ||
      !service_requested ||
      !project_description
    ) {
      return Response.json({
        success: false,
        error: "Please complete all required fields."
      }, { status: 400 });
    }

    // Check customer consent
    if (consent_given !== true) {
      return Response.json({
        success: false,
        error: "Customer consent is required."
      }, { status: 400 });
    }

    // Validate field lengths
    const fields = [
      [customer_name, 100],
      [customer_contact, 200],
      [service_requested, 150],
      [project_description, 3000],
      [project_budget || "", 100]
    ];

    if (fields.some(([value, limit]) =>
      typeof value !== "string" || value.length > limit
    )) {
      return Response.json({
        success: false,
        error: "One or more fields are too long or invalid."
      }, { status: 400 });
    }

    if (
      customer_name.trim().length < 2 ||
      customer_contact.trim().length < 3 ||
      !project_description.trim()
    ) {
      return Response.json({
        success: false,
        error: "Please provide valid enquiry details."
      }, { status: 400 });
    }

    // Check Supabase configuration
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("Supabase server configuration is missing.");
    }

    const headers = {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    };

    // Verify that the business exists
    const businessResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(business_id)}&select=id`,
      { headers }
    );

    if (!businessResponse.ok) {
      throw new Error("Could not verify the business.");
    }

    const businesses = await businessResponse.json();

    if (!businesses.length) {
      return Response.json({
        success: false,
        error: "Business not found."
      }, { status: 404 });
    }

    // Verify that the business chatbot is active
    const chatbotResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/chatbots?business_id=eq.${encodeURIComponent(business_id)}&is_active=eq.true&select=business_id`,
      { headers }
    );

    if (!chatbotResponse.ok) {
      throw new Error("Could not verify chatbot status.");
    }

    const chatbots = await chatbotResponse.json();

    if (!chatbots.length) {
      return Response.json({
        success: false,
        error: "This business is not accepting enquiries."
      }, { status: 403 });
    }

    // Save the customer enquiry
    const saveResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_enquiries`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          business_id,
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
      const errorText = await saveResponse.text();
      console.error("Enquiry save failed:", errorText);

      throw new Error("Could not save the enquiry.");
    }

    return Response.json({
      success: true,
      message: "Your enquiry has been submitted successfully."
    });

  } catch (error) {
    console.error("STREZLESS enquiry error:", error);

    return Response.json({
      success: false,
      error: error.message || "Something went wrong."
    }, { status: 500 });
  }
}

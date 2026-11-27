
export async function onRequestPost({ request, env }) {
  try {
    // 1. CHECK REQUEST METHOD AND REQUIRED SETTINGS

    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_ANON_KEY ||
      !env.SUPABASE_SERVICE_ROLE_KEY ||
      !env.PETITIBRAHEEM_OWNER_ID
    ) {
      return Response.json(
        { success: false, error: "Server configuration is incomplete." },
        { status: 500 }
      );
    }

    // 2. VERIFY USER LOGIN

    const authorization = request.headers.get("Authorization");

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return Response.json(
        { success: false, error: "Please log in first." },
        { status: 401 }
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
        { success: false, error: "Your session is invalid. Please log in again." },
        { status: 401 }
      );
    }

    const user = await authResponse.json();

    if (!user.id) {
      return Response.json(
        { success: false, error: "Unable to verify your account." },
        { status: 401 }
      );
    }

    // 3. PREPARE SECURE DATABASE HEADERS

    const databaseHeaders = {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

    // 4. LOAD BUSINESSES OWNED BY THIS USER

    const businessesResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/businesses?owner_id=eq.${encodeURIComponent(user.id)}&select=id,business_name,is_active`,
      {
        headers: databaseHeaders
      }
    );

    if (!businessesResponse.ok) {
      throw new Error("Could not load your registered businesses.");
    }

    const businesses = await businessesResponse.json();

    // 5. LOAD CURRENT BUSINESS ENQUIRIES

    let currentEnquiries = [];

    if (businesses.length > 0) {
      const businessIds = businesses
        .map(item => item.id)
        .filter(Boolean);

      if (businessIds.length > 0) {
        const businessFilter = businessIds
          .map(id => `"${id}"`)
          .join(",");

        const currentResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/customer_enquiries?business_id=in.(${encodeURIComponent(businessFilter)})&select=id,created_at,customer_name,customer_contact,service_requested,project_description,project_budget,enquiry_status,business_id,business_name&order=created_at.desc&limit=1000`,
          {
            headers: databaseHeaders
          }
        );

        if (!currentResponse.ok) {
          throw new Error("Could not load current business enquiries.");
        }

        currentEnquiries = await currentResponse.json();

        currentEnquiries = currentEnquiries.map(item => {
          const business = businesses.find(
            entry => entry.id === item.business_id
          );

          return {
            ...item,
            business_name:
              item.business_name ||
              (business ? business.business_name : "Unknown Business")
          };
        });
      }
    }

    // 6. LOAD HISTORICAL ENQUIRIES FROM DELETED BUSINESSES

    const historicalResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_enquiries?business_owner_id=eq.${encodeURIComponent(user.id)}&business_id=is.null&select=id,created_at,customer_name,customer_contact,service_requested,project_description,project_budget,enquiry_status,business_name&order=created_at.desc&limit=1000`,
      {
        headers: databaseHeaders
      }
    );

    if (!historicalResponse.ok) {
      throw new Error("Could not load historical enquiries.");
    }

    const historicalEnquiries = await historicalResponse.json();

    // 7. LOAD PETITIBRAHEEM DIRECT ENQUIRIES
    // This table belongs to the configured Petitibraheem owner.

    let petitibraheemEnquiries = [];

    if (user.id === env.PETITIBRAHEEM_OWNER_ID) {
      const petitibraheemResponse = await fetch(
        `${env.SUPABASE_URL}/rest/v1/petitibraheem_enquiries?select=id,created_at,customer_name,customer_contact,service_requested,project_description,project_budget,enquiry_status&order=created_at.desc&limit=1000`,
        {
          headers: databaseHeaders
        }
      );

      if (!petitibraheemResponse.ok) {
        throw new Error("Could not load Petitibraheem enquiries.");
      }

      petitibraheemEnquiries = await petitibraheemResponse.json();

      petitibraheemEnquiries = petitibraheemEnquiries.map(item => ({
        ...item,
        business_name: "Petitibraheem",
        source: "petitibraheem"
      }));
    }

    // 8. LABEL THE OTHER ENQUIRY SOURCES

    currentEnquiries = currentEnquiries.map(item => ({
      ...item,
      source: "current_business"
    }));

    const labelledHistoricalEnquiries = historicalEnquiries.map(item => ({
      ...item,
      source: "historical_business"
    }));

    // 9. COMBINE ALL THREE SOURCES

    const allEnquiries = [
      ...petitibraheemEnquiries,
      ...currentEnquiries,
      ...labelledHistoricalEnquiries
    ].sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

    // 10. RETURN THE REPORT DATA

    return Response.json(
      {
        success: true,
        businesses,
        total: allEnquiries.length,
        enquiries: allEnquiries,
        sources: {
          petitibraheem: petitibraheemEnquiries.length,
          current_businesses: currentEnquiries.length,
          historical_businesses: historicalEnquiries.length
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Could not generate business intelligence report."
      },
      { status: 500 }
    );
  }
}

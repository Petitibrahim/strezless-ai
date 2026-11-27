‎export async function onRequestPost({ request, env }) {
‎  try {
‎    // 1. CHECK SERVER CONFIGURATION
‎
‎    if (
‎      !env.SUPABASE_URL ||
‎      !env.SUPABASE_ANON_KEY ||
‎      !env.SUPABASE_SERVICE_ROLE_KEY ||
‎      !env.PETITIBRAHEEM_OWNER_ID ||
‎      !env.AI
‎    ) {
‎      return Response.json(
‎        { success: false, error: "Server configuration is incomplete." },
‎        { status: 500 }
‎      );
‎    }
‎
‎    // 2. VERIFY USER LOGIN
‎
‎    const authorization = request.headers.get("Authorization");
‎
‎    if (!authorization || !authorization.startsWith("Bearer ")) {
‎      return Response.json(
‎        { success: false, error: "Please log in first." },
‎        { status: 401 }
‎      );
‎    }
‎
‎    const authResponse = await fetch(
‎      ${env.SUPABASE_URL}/auth/v1/user,
‎      {
‎        headers: {
‎          apikey: env.SUPABASE_ANON_KEY,
‎          Authorization: authorization
‎        }
‎      }
‎    );
‎
‎    if (!authResponse.ok) {
‎      return Response.json(
‎        { success: false, error: "Your session is invalid. Please log in again." },
‎        { status: 401 }
‎      );
‎    }
‎
‎    const user = await authResponse.json();
‎
‎    if (!user.id) {
‎      return Response.json(
‎        { success: false, error: "Unable to verify your account." },
‎        { status: 401 }
‎      );
‎    }
‎
‎    // 3. PREPARE SECURE DATABASE HEADERS
‎
‎    const databaseHeaders = {
‎      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
‎      Authorization: Bearer ${env.SUPABASE_SERVICE_ROLE_KEY},
‎      "Content-Type": "application/json"
‎    };
‎
‎    // 4. LOAD THE USER'S BUSINESSES
‎
‎    const businessesResponse = await fetch(
‎      ${env.SUPABASE_URL}/rest/v1/businesses?owner_id=eq.${encodeURIComponent(user.id)}&select=id,business_name,
‎      { headers: databaseHeaders }
‎    );
‎
‎    if (!businessesResponse.ok) {
‎      throw new Error("Could not load your businesses.");
‎    }
‎
‎    const businesses = await businessesResponse.json();
‎
‎    // 5. LOAD CURRENT BUSINESS ENQUIRIES
‎
‎    let currentEnquiries = [];
‎
‎    if (businesses.length > 0) {
‎      const businessIds = businesses
‎        .map(item => item.id)
‎        .filter(Boolean);
‎
‎      if (businessIds.length > 0) {
‎        const businessFilter = businessIds
‎          .map(id => "${id}")
‎          .join(",");
‎
‎        const currentResponse = await fetch(
‎          ${env.SUPABASE_URL}/rest/v1/customer_enquiries?business_id=in.(${encodeURIComponent(businessFilter)})&select=id,created_at,service_requested,enquiry_status,business_id,business_name&order=created_at.desc&limit=1000,
‎          { headers: databaseHeaders }
‎        );
‎
‎        if (!currentResponse.ok) {
‎          throw new Error("Could not load current business enquiries.");
‎        }
‎
‎        currentEnquiries = await currentResponse.json();
‎
‎        currentEnquiries = currentEnquiries.map(item => {
‎          const business = businesses.find(
‎            entry => entry.id === item.business_id
‎          );
‎
‎          return {
‎            ...item,
‎            business_name:
‎              item.business_name ||
‎              (business ? business.business_name : "Unknown Business"),
‎            source: "current_business"
‎          };
‎        });
‎      }
‎    }
‎
‎    // 6. LOAD HISTORICAL ENQUIRIES
‎
‎    const historicalResponse = await fetch(
‎      ${env.SUPABASE_URL}/rest/v1/customer_enquiries?business_owner_id=eq.${encodeURIComponent(user.id)}&business_id=is.null&select=id,created_at,service_requested,enquiry_status,business_name&order=created_at.desc&limit=1000,
‎      { headers: databaseHeaders }
‎    );
‎
‎    if (!historicalResponse.ok) {
‎      throw new Error("Could not load historical enquiries.");
‎    }
‎
‎    const historicalData = await historicalResponse.json();
‎
‎    const historicalEnquiries = historicalData.map(item => ({
‎      ...item,
‎      source: "historical_business"
‎    }));
‎
‎    // 7. LOAD PETITIBRAHEEM DIRECT ENQUIRIES
‎
‎    let petitibraheemEnquiries = [];
‎
‎    if (user.id === env.PETITIBRAHEEM_OWNER_ID) {
‎      const directResponse = await fetch(
‎        ${env.SUPABASE_URL}/rest/v1/petitibraheem_enquiries?select=id,created_at,service_requested,enquiry_status&order=created_at.desc&limit=1000,
‎        { headers: databaseHeaders }
‎      );
‎
‎      if (!directResponse.ok) {
‎        throw new Error("Could not load Petitibraheem enquiries.");
‎      }
‎
‎      const directData = await directResponse.json();
‎
‎      petitibraheemEnquiries = directData.map(item => ({
‎        ...item,
‎        business_name: "Petitibraheem",
‎        source: "petitibraheem"
‎      }));
‎    }
‎
‎    // 8. COMBINE ENQUIRIES
‎
‎    const enquiries = [
‎      ...petitibraheemEnquiries,
‎      ...currentEnquiries,
‎      ...historicalEnquiries
‎    ];
‎
‎    // 9. APPLY THE SELECTED DATE RANGE
‎
‎    const requestData = await request.json().catch(() => ({}));
‎
‎    const selectedRange = ["all", "today", "7", "30"].includes(
‎      String(requestData.date_range || "all")
‎    )
‎      ? String(requestData.date_range || "all")
‎      : "all";
‎
‎
‎const timezoneOffsetMinutes = Number.isFinite(
‎  Number(requestData.timezone_offset_minutes)
‎)
‎  ? Math.max(
‎      -840,
‎      Math.min(840, Number(requestData.timezone_offset_minutes))
‎    )
‎  : 0;
‎
‎const offsetMs = timezoneOffsetMinutes * 60 * 1000;
‎
‎const nowUtc = new Date();
‎const nowLocal = new Date(nowUtc.getTime() - offsetMs);
‎
‎let filteredEnquiries = enquiries;
‎
‎if (selectedRange === "today") {
‎  const localTodayStart = new Date(nowLocal);
‎  localTodayStart.setUTCHours(0, 0, 0, 0);
‎
‎  const todayStartUtc =
‎    localTodayStart.getTime() + offsetMs;
‎
‎  const todayEndUtc =
‎    todayStartUtc + 24 * 60 * 60 * 1000;
‎
‎  filteredEnquiries = enquiries.filter(item => {
‎    const itemTime = new Date(item.created_at).getTime();
‎
‎    return (
‎      !isNaN(itemTime) &&
‎      itemTime >= todayStartUtc &&
‎      itemTime < todayEndUtc
‎    );
‎  });
‎}
‎
‎if (selectedRange === "7" || selectedRange === "30") {
‎  const days = Number(selectedRange);
‎
‎  const localStart = new Date(nowLocal);
‎
‎  localStart.setUTCDate(
‎    localStart.getUTCDate() - (days - 1)
‎  );
‎
‎  localStart.setUTCHours(0, 0, 0, 0);
‎
‎  const startUtcMs =
‎    localStart.getTime() + offsetMs;
‎
‎  filteredEnquiries = enquiries.filter(item => {
‎    const itemTime = new Date(item.created_at).getTime();
‎
‎    return (
‎      !isNaN(itemTime) &&
‎      itemTime >= startUtcMs &&
‎      itemTime <= nowUtc.getTime()
‎    );
‎  });
‎}
‎
‎    
‎
‎
‎    // 9. CALCULATE BUSINESS STATISTICS
‎
‎    const total = filteredEnquiries.length;
‎
‎    const countStatus = status =>
‎  filteredEnquiries.filter(
‎    item => item.enquiry_status === status
‎  ).length;
‎
‎    const newCount = countStatus("new");
‎    const contactedCount = countStatus("contacted");
‎    const inProgressCount = countStatus("in_progress");
‎    const completedCount = countStatus("completed");
‎
‎    const completionRate = total > 0
‎      ? ((completedCount / total) * 100).toFixed(1)
‎      : "0.0";
‎
‎    // 10. GROUP ENQUIRIES BY BUSINESS
‎
‎    const businessCounts = {};
‎
‎    filteredEnquiries.forEach(item => {
‎      const name = item.business_name || "Unknown Business";
‎
‎      businessCounts[name] =
‎        (businessCounts[name] || 0) + 1;
‎    });
‎
‎    // 11. GROUP ENQUIRIES BY REQUESTED SERVICE
‎
‎    const serviceCounts = {};
‎
‎    filteredEnquiries.forEach(item => {
‎      const service = item.service_requested || "Unspecified";
‎
‎      serviceCounts[service] =
‎        (serviceCounts[service] || 0) + 1;
‎    });
‎
‎    const topServices = Object.entries(serviceCounts)
‎      .sort((a, b) => b[1] - a[1])
‎      .slice(0, 10);
‎
‎    // 12. PREPARE AI ANALYSIS
‎
‎    const statistics = {
‎      total_enquiries: total,
‎  selected_date_range: selectedRange,
‎      new_enquiries: newCount,
‎      contacted_enquiries: contactedCount,
‎      in_progress_enquiries: inProgressCount,
‎      completed_enquiries: completedCount,
‎      completion_rate: completionRate + "%",
‎      enquiries_by_business: businessCounts,
‎      top_requested_services: topServices,
‎     enquiry_sources: {
‎  petitibraheem_direct: filteredEnquiries.filter(
‎    item => item.source === "petitibraheem"
‎  ).length,
‎
‎  current_businesses: filteredEnquiries.filter(
‎    item => item.source === "current_business"
‎  ).length,
‎
‎  historical_businesses: filteredEnquiries.filter(
‎    item => item.source === "historical_business"
‎  ).length
‎}
‎    };
‎
‎    const systemPrompt = `
‎You are STREZLESS AI Business Intelligence Analyst.
‎The report must analyse only the selected date range supplied in the statistics.
‎Clearly state the date range being analysed.
‎Analyse the supplied business statistics accurately.
‎
‎Provide a clear report with these sections:
‎
1. ‎Overall Business Performance
2. ‎Best Performing Businesses
3. ‎Most Requested Services
4. ‎Enquiry Status Analysis
5. ‎Areas That Need Attention
6. ‎Practical Recommendations
‎
‎Rules:
· ‎Use only the supplied statistics.
· ‎Never invent figures, customers, revenue or business results.
· ‎Do not claim that enquiries equal sales or revenue.
· ‎Explain when there is insufficient data.
· ‎Give practical recommendations suitable for small businesses.
· ‎Use clear, professional and beginner-friendly language.
· ‎Format the report with readable headings and bullet points.
‎`;
‎
‎    const userPrompt = `
‎Analyse these STREZLESS AI business statistics:
‎
‎${JSON.stringify(statistics, null, 2)}
‎`;
‎
‎    // 13. GENERATE AI INSIGHTS
‎
‎    const result = await env.AI.run(
‎      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
‎      {
‎        messages: [
‎          { role: "system", content: systemPrompt },
‎          { role: "user", content: userPrompt }
‎        ],
‎        max_tokens: 2500,
‎        temperature: 0.5
‎      }
‎    );
‎
‎    const insights =
‎      result?.response ||
‎      result?.choices?.[0]?.message?.content;
‎
‎    if (!insights) {
‎      throw new Error("The AI returned an empty response.");
‎    }
‎
‎    // 14. RETURN THE REPORT
‎
‎    return Response.json(
‎      {
‎        success: true,
‎        statistics,
‎        insights
‎      },
‎      {
‎        headers: {
‎          "Cache-Control": "no-store"
‎        }
‎      }
‎    );
‎
‎  } catch (error) {
‎    console.error("BUSINESS INSIGHTS ERROR:", error);
‎
‎    return Response.json(
‎      {
‎        success: false,
‎        error: error.message ||
‎          "Could not generate business insights."
‎      },
‎      { status: 500 }
‎    );
‎  }
‎}
‎
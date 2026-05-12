import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Normally this would parse the entire text into `parsed_data` and do compliance checks
// However parsing logic is heavily defined in `js/parser.js`.
// We can at least simulate the structure and run the compliance checks.
serve(async (req) => {
  try {
    const { game_id, turn_number, raw_output } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Dummy parsed data structure, frontend does heavy lifting
    const parsed_data = {
      raw_output: raw_output
    }

    // Example of compliance warnings (could import sentence-compliance logic if it was a module)
    // For now we just return an empty warning list or basic simulated warnings
    const validation_warnings: string[] = []

    const sentenceRegex = /句式△([A-Z]\d{2,3})/g;
    let match;
    const reportedIds = [];
    while ((match = sentenceRegex.exec(raw_output)) !== null) {
      reportedIds.push(match[1]);
    }

    if (reportedIds.length > 0) {
        validation_warnings.push("Info: Sentences found: " + reportedIds.join(', '));
    }

    return new Response(
      JSON.stringify({ parsed_data, validation_warnings }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})

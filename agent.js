const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// Load .env manually to avoid conflicts with other tools
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  });
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JSON_SCHEMA = `
CRITICAL INSTRUCTION: Your entire response must be a single valid JSON object.
Do NOT include any text before the opening { or after the closing }.
Do NOT use markdown code fences (no \`\`\`json).
Start your response with { and end with }.

Required JSON schema:
{
  "date": "YYYY-MM-DD",
  "mode": "daily",
  "executive_summary": {
    "title": "string — headline for this brief",
    "body": "string — 3-5 sentence summary of the most important developments",
    "key_message": "string — one sentence takeaway"
  },
  "stats": {
    "items_reviewed": number,
    "items_reported": number,
    "filter_efficiency": "string e.g. '87%'",
    "affected_clients": number
  },
  "items": [
    {
      "id": "string — short unique id e.g. 'edpb-2026-04-29-01'",
      "priority": "critical | high | medium | radar",
      "confidence": "high | moderate | preliminary",
      "title": "string",
      "summary": "string — 2-3 sentences",
      "deep_analysis": "string — detailed analysis with legal implications",
      "sectors": ["SaaS/B2B", "AI/ML", "Health Tech", "E-commerce"],
      "action_plan": {
        "this_week": ["string — specific action"],
        "this_month": ["string — specific action"],
        "three_months": ["string — specific action"]
      },
      "sources": [
        { "name": "string", "url": "string", "type": "primary | secondary" }
      ],
      "business_opportunity": "string — optional, omit key if not applicable"
    }
  ],
  "themes": [
    { "title": "string", "body": "string — pattern analysis across items" }
  ],
  "calendar": [
    { "date": "string", "event": "string", "authority": "string", "sectors": ["string"] }
  ],
  "client_messages": [
    { "for": "string e.g. 'E-commerce clients'", "message": "string — 1-2 sentence strategic message" }
  ],
  "tracking_summary": {
    "items_reported_this_run": ["string — item ids reported today"],
    "ongoing_to_track": ["string — brief description of items to monitor next run"]
  }
}`;

async function runDailyBrief() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  console.log(`\n[${today}] Starting daily regulatory brief...\n`);

  // 1. Read system prompt
  const systemPromptPath = path.join(__dirname, 'prompts/regulatory-monitoring-agent.md');
  const systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
  console.log('✓ System prompt loaded.');

  // 2. Load or initialize tracking log
  const trackingLogPath = path.join(__dirname, 'data/tracking-log.json');
  let trackingLog = { last_run: null, items_reported: [], ongoing: [] };
  if (fs.existsSync(trackingLogPath)) {
    try {
      trackingLog = JSON.parse(fs.readFileSync(trackingLogPath, 'utf8'));
      console.log(`✓ Tracking log loaded. Last run: ${trackingLog.last_run || 'never'}`);
    } catch {
      console.warn('Warning: Tracking log unreadable, starting fresh.');
    }
  } else {
    console.log('No tracking log found — starting fresh.');
  }

  // 3. Build the user message
  const recentlyReported = (trackingLog.items_reported || []).slice(-20);
  const ongoing = trackingLog.ongoing || [];

  const userMessage = `Run Daily Brief mode for today: ${today}.

PREVIOUSLY REPORTED ITEMS — do not re-report unless there is a material new development:
${recentlyReported.length ? JSON.stringify(recentlyReported, null, 2) : '(none yet — this is the first run)'}

ONGOING ITEMS TO CHECK FOR UPDATES:
${ongoing.length ? JSON.stringify(ongoing, null, 2) : '(none)'}

${JSON_SCHEMA}`;

  // 4. Call the API with web search enabled
  console.log('Calling Anthropic API (this may take 30-90 seconds while the agent searches)...');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  console.log(`✓ API response received (stop reason: ${response.stop_reason})`);

  // 5. Extract text from the response
  // The model may return tool_use blocks (search calls) and text blocks (the final answer)
  // We only want the text blocks
  let jsonText = '';
  let searchCount = 0;
  for (const block of response.content) {
    if (block.type === 'text') {
      jsonText += block.text;
    } else if (block.type === 'tool_use') {
      searchCount++;
    }
  }
  if (searchCount > 0) {
    console.log(`✓ Agent performed ${searchCount} web search(es).`);
  }

  if (!jsonText.trim()) {
    throw new Error('API returned no text content. The model may not have produced a final answer.');
  }

  // 6. Parse the JSON response
  // The model may narrate before producing JSON — find the first { and last } to extract it
  let brief;
  try {
    let cleaned = jsonText
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    // If the response starts with narration, find where the JSON begins
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart > 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    brief = JSON.parse(cleaned);
  } catch (parseError) {
    const preview = jsonText.substring(0, 800);
    throw new Error(
      `Could not parse response as JSON.\nParse error: ${parseError.message}\n\nResponse preview:\n${preview}`
    );
  }

  console.log(`✓ JSON parsed successfully.`);

  // 7. Save the brief
  const briefPath = path.join(__dirname, `data/brief-${today}.json`);
  fs.writeFileSync(briefPath, JSON.stringify(brief, null, 2), 'utf8');
  console.log(`✓ Brief saved to data/brief-${today}.json`);

  // 8. Update the tracking log
  const newTracking = {
    last_run: today,
    items_reported: [
      ...recentlyReported.slice(-50),
      ...(brief.tracking_summary?.items_reported_this_run || [])
    ],
    ongoing: brief.tracking_summary?.ongoing_to_track || []
  };
  fs.writeFileSync(trackingLogPath, JSON.stringify(newTracking, null, 2), 'utf8');
  console.log(`✓ Tracking log updated.`);

  // 9. Print summary
  const itemCount = brief.items?.length ?? 0;
  const reviewed = brief.stats?.items_reviewed ?? '?';
  const priorities = (brief.items || []).map(i => i.priority);
  const critical = priorities.filter(p => p === 'critical').length;
  const high = priorities.filter(p => p === 'high').length;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Brief complete for ${today}`);
  console.log(`Items reviewed: ${reviewed}`);
  console.log(`Items reported: ${itemCount} (${critical} critical, ${high} high)`);
  console.log(`Executive summary: ${brief.executive_summary?.title || '(no title)'}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return brief;
}

runDailyBrief().catch(err => {
  console.error('\n✗ Fatal error running daily brief:');
  console.error(err.message);
  process.exit(1);
});

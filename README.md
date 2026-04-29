# LexWatch — Automated Regulatory Monitoring

Automated regulatory intelligence for a privacy and technology law practice.

**Live Dashboard:** https://kesemrobert-lang.github.io/regulatory-agent/

---

## What this system does

Every 5 days, an AI agent automatically:
1. Searches dozens of regulatory sources (EU, UK, US, Israel) for new developments
2. Filters and prioritizes items by relevance to your practice
3. Writes a structured brief with analysis and action plans
4. Publishes an updated dashboard to the live URL above

---

## How to view the dashboard

Just open the link: **https://kesemrobert-lang.github.io/regulatory-agent/**

- The **Overview** tab shows the executive summary and key statistics
- The **Critical** and **High** tabs show items requiring attention
- The **Themes** tab shows cross-cutting patterns
- The **Calendar** tab shows upcoming regulatory deadlines
- The **Archive** tab lets you browse all past briefs

---

## How to trigger a run manually

You can run the agent at any time (not just on the automatic schedule):

1. Go to https://github.com/kesemrobert-lang/regulatory-agent
2. Click the **Actions** tab at the top
3. Click **Daily Regulatory Brief** in the left sidebar
4. Click the **Run workflow** button (top right of the table)
5. Click the green **Run workflow** button in the dropdown
6. Wait about 2–3 minutes, then refresh the dashboard

---

## Automatic schedule

The agent runs automatically every 5 days at **12:00 Israel time** (summer).
You do not need to do anything — it runs by itself.

---

## How to update what the agent monitors

The agent's instructions live in one file:

**`prompts/regulatory-monitoring-agent.md`**

To edit it:
1. Go to https://github.com/kesemrobert-lang/regulatory-agent
2. Click on the `prompts` folder
3. Click `regulatory-monitoring-agent.md`
4. Click the pencil icon (Edit) in the top right
5. Make your changes
6. Scroll down and click **Commit changes**

Changes take effect on the next run.

---

## How to change the schedule

1. Go to https://github.com/kesemrobert-lang/regulatory-agent
2. Click on `.github` → `workflows` → `daily-brief.yml`
3. Click the pencil icon (Edit)
4. Find the line that starts with `- cron:` and change the value
5. Commit changes

Cron format: `'minute hour */every-N-days * *'`
- Current value: `'0 9 */5 * *'` = 09:00 UTC = 12:00 Israel time, every 5 days
- To run every 7 days: `'0 9 */7 * *'`
- To run every day: `'0 9 * * *'`

---

## Troubleshooting

**The dashboard hasn't updated in a while**
- Go to the Actions tab and check if the last run succeeded (green checkmark) or failed (red X)
- If it failed, click on the run to see the error message
- You can always trigger a manual run (see above)

**The run failed with an API error**
- Your Anthropic API credit balance may be low
- Top up at https://console.anthropic.com → Billing

**I want to add a new regulatory area or country**
- Edit `prompts/regulatory-monitoring-agent.md` (see above)
- Add the sources and topics you want monitored

---

## Technical overview

| Component | What it does |
|---|---|
| `agent.js` | Calls the Claude API with web search, produces a JSON brief |
| `build-dashboard.js` | Converts the JSON brief into HTML pages |
| `.github/workflows/daily-brief.yml` | GitHub Actions schedule and steps |
| `prompts/regulatory-monitoring-agent.md` | The AI agent's instructions |
| `data/` | All historical briefs in JSON format |
| `docs/` | The published HTML dashboard files |

---

Built with Node.js · Anthropic Claude API · GitHub Actions · GitHub Pages

const fs = require('fs');
const path = require('path');

// ─── Utilities ──────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatShortDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
}

function priorityIcon(p) {
  return { critical: '🔴', high: '🟠', medium: '🟡', radar: '🔵' }[p] || '⚪';
}

function priorityLabel(p) {
  return { critical: 'Critical', high: 'High', medium: 'Medium', radar: 'Radar' }[p] || p;
}

function priorityHebrew(p) {
  return { critical: 'דחוף', high: 'גבוה', medium: 'בינוני', radar: 'מעקב' }[p] || p;
}

function confidenceClass(c) {
  return c === 'moderate' || c === 'preliminary' ? 'moderate' : '';
}

function confidenceLabel(c) {
  return { high: 'High Confidence', moderate: 'Moderate Confidence', preliminary: 'Preliminary' }[c] || c;
}

// ─── Item Card HTML ──────────────────────────────────────────────────────────

function genSectorTags(sectors) {
  if (!sectors || !sectors.length) return '';
  return sectors.map((s, i) =>
    `<span class="sector-tag${i === 0 ? ' primary' : ''}">${escapeHtml(s)}</span>`
  ).join('\n              ');
}

const ACTION_TIMEFRAME_LABELS = {
  this_week: 'This Week',
  this_month: 'This Month',
  three_months: '3-Month Outlook'
};

function genActionTimeframe(label, items, urgency = false) {
  if (!items || !items.length) return '';
  const title = ACTION_TIMEFRAME_LABELS[label] || label;
  const itemsHtml = items.map((action, i) =>
    `<div class="action-item">
                  <span class="action-number">${String(i + 1).padStart(2, '0')}</span>
                  <div>${escapeHtml(action)}</div>
                </div>`
  ).join('\n                ');
  return `<div class="action-timeframe">
                <div class="action-timeframe-title">${urgency ? '<span class="urgency">URGENT</span>' : ''}${escapeHtml(title)}</div>
                ${itemsHtml}
              </div>`;
}

function genSources(sources) {
  if (!sources || !sources.length) return '';
  return sources.map(s => {
    const urlDisplay = s.url && s.url !== 'unknown' ? s.url.replace(/^https?:\/\//, '').split('/')[0] : s.type || 'Primary';
    const linkHtml = s.url && s.url.startsWith('http')
      ? `<a href="${escapeHtml(s.url)}" target="_blank" class="source-link">${escapeHtml(urlDisplay)}</a>`
      : `<span class="source-link">${escapeHtml(s.type || 'Primary')}</span>`;
    return `<div class="source-item">
              <span>${escapeHtml(s.name)}</span>
              ${linkHtml}
            </div>`;
  }).join('\n            ');
}

function genItemCard(item, index, total) {
  const p = item.priority || 'medium';
  const hasOpportunity = item.business_opportunity && item.business_opportunity.trim();
  const actionPlan = item.action_plan || {};

  return `<div class="detailed-card ${p}">
        <div class="card-top">
          <div class="card-badges">
            <span class="priority-badge ${p}">${priorityIcon(p)} ${priorityLabel(p)}</span>
            <span class="confidence-badge ${confidenceClass(item.confidence)}">${escapeHtml(confidenceLabel(item.confidence))}</span>
            <span class="card-number">#${String(index + 1).padStart(2, '0')} of ${String(total).padStart(2, '0')}</span>
          </div>
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <div class="card-sectors">
            ${genSectorTags(item.sectors)}
          </div>
        </div>
        <div class="card-body">
          <div class="body-section">
            <div class="body-label"><span class="body-label-icon">i</span>Key Finding</div>
            <div class="body-text">${escapeHtml(item.summary)}</div>
          </div>
          ${item.deep_analysis ? `<div class="body-section">
            <div class="body-label"><span class="body-label-icon">§</span>Deep Analysis</div>
            <div class="body-text">${escapeHtml(item.deep_analysis)}</div>
          </div>` : ''}
          <div class="body-section">
            <div class="body-label"><span class="body-label-icon">→</span>Action Plan</div>
            <div class="action-list">
              ${genActionTimeframe('this_week', actionPlan.this_week, p === 'critical')}
              ${genActionTimeframe('this_month', actionPlan.this_month)}
              ${genActionTimeframe('three_months', actionPlan.three_months)}
            </div>
            ${hasOpportunity ? `<div class="business-note">
              <span class="business-note-icon">$</span>
              <div><strong>Business Opportunity:</strong> ${escapeHtml(item.business_opportunity)}</div>
            </div>` : ''}
          </div>
          ${item.sources && item.sources.length ? `<div class="body-section">
            <div class="body-label"><span class="body-label-icon">*</span>Sources</div>
            <div class="sources-list">
              ${genSources(item.sources)}
            </div>
          </div>` : ''}
        </div>
      </div>`;
}

// ─── Tab content generators ──────────────────────────────────────────────────

function genOverviewTab(brief) {
  const items = brief.items || [];
  const criticalItems = items.filter(i => i.priority === 'critical');
  const stats = brief.stats || {};
  const es = brief.executive_summary || {};

  // Sector impact matrix — highest priority per sector
  const sectors = ['E-commerce', 'AI/ML', 'Health Tech', 'SaaS/B2B'];
  const sectorRisk = {};
  const sectorDesc = {};
  const priorityOrder = { critical: 0, high: 1, medium: 2, radar: 3 };
  sectors.forEach(s => { sectorRisk[s] = 'radar'; sectorDesc[s] = '—'; });
  items.forEach(item => {
    (item.sectors || []).forEach(sector => {
      const match = sectors.find(s => sector.includes(s.split('/')[0]));
      if (match && (priorityOrder[item.priority] < priorityOrder[sectorRisk[match]])) {
        sectorRisk[match] = item.priority;
        sectorDesc[match] = item.title;
      }
    });
  });

  const matrixRows = sectors.map(sector => `<div class="matrix-row">
            <div style="font-weight:600;font-family:'Fraunces',serif;font-size:15px;">${sector}</div>
            <div class="matrix-risk-bar">
              <div class="risk-dot ${sectorRisk[sector]}"></div>
              <span class="risk-label ${sectorRisk[sector]}">${priorityLabel(sectorRisk[sector])}</span>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);">${escapeHtml(sectorDesc[sector]).substring(0, 80)}${sectorDesc[sector].length > 80 ? '…' : ''}</div>
            <div style="font-family:'JetBrains Mono',monospace;font-weight:600;">${items.filter(i => (i.sectors||[]).some(s => s.includes(sector.split('/')[0]))).length} items</div>
          </div>`).join('\n          ');

  const criticalPreview = criticalItems.length
    ? criticalItems.map(item => `<div class="detailed-card critical">
          <div class="card-top">
            <div class="card-badges">
              <span class="priority-badge critical">🔴 Critical</span>
              <span class="confidence-badge ${confidenceClass(item.confidence)}">${escapeHtml(confidenceLabel(item.confidence))}</span>
            </div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <div class="card-sectors">${genSectorTags(item.sectors)}</div>
          </div>
          <div class="card-body">
            <div class="body-section">
              <div class="body-label"><span class="body-label-icon">i</span>Key Finding</div>
              <div class="body-text">${escapeHtml(item.summary)}</div>
            </div>
          </div>
        </div>`).join('\n        ')
    : '<p style="color:var(--text-muted);padding:20px 0;">No critical items today.</p>';

  const methodology = `Primary sources: EDPB, EU AI Office, Israeli PPA, CNIL, ICO. Secondary sources: IAPP, DLA Piper, Hogan Lovells, WilmerHale. Items reviewed: ${stats.items_reviewed || '?'}. Items reported: ${stats.items_reported || '?'} (filter efficiency: ${stats.filter_efficiency || '?'}).`;

  return `<div class="page-header">
          <div>
            <h1 class="page-title">Daily Regulatory Brief</h1>
            <div class="page-subtitle">${escapeHtml(formatDisplayDate(brief.date))} · Lexwatch Intelligence</div>
          </div>
          <div class="btn-group">
            <button class="btn" onclick="window.print()">Export PDF</button>
            <a href="archive.html" class="btn">Archive →</a>
          </div>
        </div>

        <div class="exec-summary">
          <div class="exec-summary-label">⚡ Executive Summary</div>
          <h2 class="exec-summary-title">${escapeHtml(es.title)}</h2>
          <div class="exec-summary-body">${escapeHtml(es.body)}</div>
          ${es.key_message ? `<div class="exec-summary-highlight">${escapeHtml(es.key_message)}</div>` : ''}
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Items Reported</div>
            <div class="stat-value">${stats.items_reported || 0}</div>
            <div class="stat-change">of ${stats.items_reviewed || '?'} reviewed</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Critical</div>
            <div class="stat-value">${criticalItems.length}</div>
            <div class="stat-change up">${criticalItems.length > 0 ? 'Immediate action required' : 'No critical items'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Affected Sectors</div>
            <div class="stat-value">${stats.affected_clients || '?'}</div>
            <div class="stat-change">active sectors</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Filter Efficiency</div>
            <div class="stat-value">${stats.filter_efficiency || '?'}</div>
            <div class="stat-change down">${(stats.items_reviewed || 0) - (stats.items_reported || 0)} items filtered out</div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <h2 class="section-title">Sector Impact Matrix</h2>
            <span class="section-meta">Four Sectors</span>
          </div>
          <div class="table-wrapper">
            <div class="matrix-row matrix-header">
              <div>Sector</div><div>Risk Level</div><div>Action Priority</div><div>Items</div>
            </div>
            ${matrixRows}
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <h2 class="section-title">Critical — Immediate Action<span class="priority-indicator critical"></span></h2>
            <span class="section-meta" style="cursor:pointer;color:var(--accent);" onclick="switchTabById('critical')">View all →</span>
          </div>
          ${criticalPreview}
        </div>

        <div class="methodology-box">
          <strong>📊 Methodology:</strong> ${escapeHtml(methodology)}
        </div>`;
}

function genItemsTab(brief, priority, title, subtitle) {
  const items = (brief.items || []).filter(i => i.priority === priority);
  if (!items.length) {
    return `<div class="page-header">
          <div>
            <h1 class="page-title">${title}</h1>
            <div class="page-subtitle">${subtitle}</div>
          </div>
        </div>
        <p style="color:var(--text-muted);padding:20px 0;">No items at this priority level today.</p>`;
  }
  return `<div class="page-header">
          <div>
            <h1 class="page-title">${title}</h1>
            <div class="page-subtitle">${subtitle} · ${items.length} item${items.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        ${items.map((item, i) => genItemCard(item, i, items.length)).join('\n        ')}`;
}

function genThemesTab(brief) {
  const themes = brief.themes || [];
  const themeCards = themes.length
    ? themes.map((t, i) => `<div class="theme-card">
          <span class="theme-number">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="theme-title">${escapeHtml(t.title)}</h3>
          <div class="theme-body">${escapeHtml(t.body)}</div>
        </div>`).join('\n        ')
    : '<p style="color:var(--text-muted);">No themes to report today.</p>';

  return `<div class="page-header">
          <div>
            <h1 class="page-title">Key Themes</h1>
            <div class="page-subtitle">Cross-sector patterns · ${escapeHtml(formatDisplayDate(brief.date))}</div>
          </div>
        </div>
        ${themeCards}`;
}

function genCalendarTab(brief) {
  const calendar = brief.calendar || [];
  const today = brief.date || '';

  const tableRows = calendar.map(e => {
    const isUpcoming = e.date && e.date <= today;
    return `<tr>
                  <td><span class="table-date${isUpcoming ? ' table-date-upcoming' : ''}">${escapeHtml(e.date)}</span></td>
                  <td>${escapeHtml(e.event)}</td>
                  <td>${escapeHtml(e.authority)}</td>
                  <td>${(e.sectors || []).map(s => `<span class="sector-tag">${escapeHtml(s)}</span>`).join(' ')}</td>
                </tr>`;
  }).join('\n                ');

  const timelineItems = calendar.slice(0, 5).map(e => `<div class="timeline-item">
                <div class="timeline-date">${escapeHtml(e.date)}</div>
                <div class="timeline-title">${escapeHtml(e.event)}</div>
                <div class="timeline-desc">${escapeHtml(e.authority)}</div>
              </div>`).join('\n              ');

  return `<div class="page-header">
          <div>
            <h1 class="page-title">Regulatory Calendar</h1>
            <div class="page-subtitle">Upcoming regulatory events and deadlines</div>
          </div>
        </div>
        <div class="dashboard-grid">
          <div>
            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>Date</th><th>Event</th><th>Authority</th><th>Sector</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows || '<tr><td colspan="4" style="color:var(--text-muted);">No events to report.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div class="side-card">
              <h3 class="side-card-title">Critical Milestones</h3>
              <div class="side-card-subtitle">Key upcoming deadlines</div>
              <div class="timeline">
                ${timelineItems || '<p style="color:var(--text-muted);">No milestones found.</p>'}
              </div>
            </div>
          </div>
        </div>`;
}

function genClientsTab(brief) {
  const items = brief.items || [];
  const sectors = ['E-commerce', 'AI/ML', 'Health Tech', 'SaaS/B2B'];
  const priorityOrder = { critical: 0, high: 1, medium: 2, radar: 3 };

  const rows = sectors.map(sector => {
    const sectorItems = items.filter(i => (i.sectors || []).some(s => s.includes(sector.split('/')[0])));
    const topPriority = sectorItems.reduce((best, i) => priorityOrder[i.priority] < priorityOrder[best] ? i.priority : best, 'radar');
    const topItem = sectorItems.find(i => i.priority === topPriority);
    if (!sectorItems.length) return '';
    return `<tr>
              <td><strong style="font-family:'Fraunces',serif;font-size:15px;">${sector}</strong></td>
              <td>${sectorItems.map(i => `<span class="sector-tag">${priorityIcon(i.priority)} ${escapeHtml(i.title.substring(0, 40))}…</span>`).join('<br>')}</td>
              <td><span class="risk-label ${topPriority}">● ${priorityLabel(topPriority)}</span></td>
              <td style="font-size:12px;color:var(--text-secondary);">${topItem ? escapeHtml(topItem.action_plan?.this_week?.[0]?.substring(0, 60) || '—') + '…' : '—'}</td>
            </tr>`;
  }).filter(Boolean).join('\n            ');

  return `<div class="page-header">
          <div>
            <h1 class="page-title">Sector Impact</h1>
            <div class="page-subtitle">How today's developments affect each practice area · ${escapeHtml(formatDisplayDate(brief.date))}</div>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Sector</th><th>Relevant Items</th><th>Risk</th><th>Immediate Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="4" style="color:var(--text-muted);">No data for this period.</td></tr>'}
            </tbody>
          </table>
        </div>`;
}

function genMessagesTab(brief) {
  const messages = brief.client_messages || [];
  const cards = messages.length
    ? messages.map(m => `<div class="message-card">
          <div class="message-for">${escapeHtml(m.for)}</div>
          <div class="message-body">${escapeHtml(m.message)}</div>
        </div>`).join('\n        ')
    : '<p style="color:var(--text-muted);">No client messages this period.</p>';

  return `<div class="page-header">
          <div>
            <h1 class="page-title">Key Messages for Clients</h1>
            <div class="page-subtitle">Strategic Messages · Draft updates for review</div>
          </div>
        </div>
        ${cards}
        <div style="margin-top:40px;padding:24px;background:var(--accent-soft);border-radius:8px;border:1px solid #c7d2fe;">
          <h3 style="font-family:'Fraunces',serif;font-size:18px;margin-bottom:12px;color:var(--accent);">📧 Reminder</h3>
          <p style="font-size:14px;line-height:1.75;color:var(--text-primary);">
            All messages are <strong>DRAFTS only</strong> — review and approve before sending to clients.
          </p>
        </div>`;
}

// ─── Full page generator ─────────────────────────────────────────────────────

function generateBriefHtml(brief, css) {
  const items = brief.items || [];
  const criticalCount = items.filter(i => i.priority === 'critical').length;
  const highCount = items.filter(i => i.priority === 'high').length;
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lexwatch — ${escapeHtml(formatDisplayDate(brief.date))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Heebo:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${css}
/* LTR overrides */
.table th { text-align: left; }
.exec-summary::before { left: 0; right: auto; }
.exec-summary-highlight { border-left: 3px solid var(--accent); border-right: none; }
.message-card { border-left: 3px solid var(--accent); border-right: none; }
.detailed-card.critical { border-left: 4px solid var(--critical); border-right: none; }
.detailed-card.high { border-left: 4px solid var(--high); border-right: none; }
.detailed-card.medium { border-left: 4px solid var(--medium); border-right: none; }
.theme-number { left: 28px; right: auto; }
.theme-title, .theme-body { padding-left: 80px; padding-right: 0; }
.timeline { padding-left: 24px; padding-right: 0; }
.timeline::before { left: 5px; right: auto; }
.timeline-item::before { left: -23px; right: auto; }
.card-number { margin-right: auto; margin-left: 0; }
</style>
</head>
<body>
<div class="app">
  <div class="header">
    <div class="header-top">
      <div class="logo">Lex<span class="logo-mark">·</span>Watch</div>
      <div class="user-info">
        <span class="date">Daily Brief · ${escapeHtml(formatShortDate(brief.date))} · Updated ${escapeHtml(now)}</span>
        <div class="avatar">RH</div>
      </div>
    </div>
    <div class="tabs">
      <button class="tab active" onclick="switchTab('overview',this)">Overview</button>
      <button class="tab" onclick="switchTab('critical',this)">Critical ${criticalCount > 0 ? `<span class="count">${criticalCount}</span>` : ''}</button>
      <button class="tab" onclick="switchTab('high',this)">High ${highCount > 0 ? `<span class="count">${highCount}</span>` : ''}</button>
      <button class="tab" onclick="switchTab('themes',this)">Themes</button>
      <button class="tab" onclick="switchTab('calendar',this)">Calendar</button>
      <button class="tab" onclick="switchTab('clients',this)">Sectors</button>
      <button class="tab" onclick="switchTab('messages',this)">Messages</button>
    </div>
  </div>

  <div class="content">
    <div class="view active" id="overview">
      ${genOverviewTab(brief)}
    </div>
    <div class="view" id="critical">
      ${genItemsTab(brief, 'critical', 'Critical Items', 'Critical Priority · Requires immediate attention')}
    </div>
    <div class="view" id="high">
      ${genItemsTab(brief, 'high', 'High Priority Items', 'High Priority · Address within 1–2 weeks')}
    </div>
    <div class="view" id="themes">
      ${genThemesTab(brief)}
    </div>
    <div class="view" id="calendar">
      ${genCalendarTab(brief)}
    </div>
    <div class="view" id="clients">
      ${genClientsTab(brief)}
    </div>
    <div class="view" id="messages">
      ${genMessagesTab(brief)}
    </div>
  </div>
</div>

<script>
function switchTab(tabId, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function switchTabById(tabId) {
  const btn = Array.from(document.querySelectorAll('.tab')).find(b => b.getAttribute('onclick').includes(tabId));
  if (btn) switchTab(tabId, btn);
}
</script>
</body>
</html>`;
}

function generateArchiveHtml(briefs, css) {
  const rows = briefs
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(b => {
      const items = b.items || [];
      const critical = items.filter(i => i.priority === 'critical').length;
      const high = items.filter(i => i.priority === 'high').length;
      return `<tr>
          <td><span class="table-date">${escapeHtml(formatShortDate(b.date))}</span></td>
          <td style="font-family:'Fraunces',serif;">${escapeHtml(b.executive_summary?.title || '—')}</td>
          <td>${critical > 0 ? `<span class="priority-badge critical" style="font-size:11px;">🔴 ${critical}</span>` : ''} ${high > 0 ? `<span class="priority-badge high" style="font-size:11px;">🟠 ${high}</span>` : ''}</td>
          <td>${b.stats?.items_reviewed || '?'}</td>
          <td><a href="brief-${escapeHtml(b.date)}.html" class="btn btn-primary" style="font-size:12px;padding:6px 14px;">Open →</a></td>
        </tr>`;
    }).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lexwatch — Archive</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Heebo:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${css}
.table th { text-align: left; }
</style>
</head>
<body>
<div class="app">
  <div class="header">
    <div class="header-top">
      <div class="logo">Lex<span class="logo-mark">·</span>Watch</div>
      <div class="user-info">
        <span class="date">Archive · ${briefs.length} brief${briefs.length !== 1 ? 's' : ''}</span>
        <div class="avatar">RH</div>
      </div>
    </div>
  </div>
  <div class="content">
    <div class="page-header">
      <div>
        <h1 class="page-title">Archive</h1>
        <div class="page-subtitle">All regulatory briefs</div>
      </div>
      <a href="index.html" class="btn btn-primary">Latest Brief →</a>
    </div>
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr><th>Date</th><th>Title</th><th>Priorities</th><th>Items Reviewed</th><th></th></tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="color:var(--text-muted);">No briefs in the archive yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Building dashboard...\n');

  // Extract CSS from template
  const templatePath = path.join(__dirname, 'templates/dashboard.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  const cssMatch = templateHtml.match(/<style>([\s\S]*?)<\/style>/);
  if (!cssMatch) throw new Error('Could not extract CSS from template.');
  const css = cssMatch[1];
  console.log('✓ CSS extracted from template.');

  // Find all brief JSON files
  const dataDir = path.join(__dirname, 'data');
  const docsDir = path.join(__dirname, 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

  const briefFiles = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('brief-') && f.endsWith('.json'))
    .sort();

  if (!briefFiles.length) throw new Error('No brief JSON files found in data/.');
  console.log(`✓ Found ${briefFiles.length} brief file(s): ${briefFiles.join(', ')}`);

  // Generate HTML for each brief
  const allBriefs = [];
  briefFiles.forEach(file => {
    const brief = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    allBriefs.push(brief);
    const html = generateBriefHtml(brief, css);
    const outFile = `brief-${brief.date}.html`;
    fs.writeFileSync(path.join(docsDir, outFile), html, 'utf8');
    console.log(`✓ Generated docs/${outFile}`);
  });

  // Copy latest as index.html
  const latest = allBriefs[allBriefs.length - 1];
  const latestHtml = generateBriefHtml(latest, css);
  fs.writeFileSync(path.join(docsDir, 'index.html'), latestHtml, 'utf8');
  console.log(`✓ Generated docs/index.html (latest: ${latest.date})`);

  // Generate archive
  const archiveHtml = generateArchiveHtml(allBriefs, css);
  fs.writeFileSync(path.join(docsDir, 'archive.html'), archiveHtml, 'utf8');
  console.log(`✓ Generated docs/archive.html`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Dashboard built successfully.`);
  console.log(`Open docs/index.html in your browser to preview.`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main();

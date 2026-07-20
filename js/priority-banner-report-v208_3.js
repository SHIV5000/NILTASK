/**
 * NILTASK Priority Banner Recipient Report v208.3
 * Adds in-app acknowledged/pending report and PDF export.
 * Loads report data only when an Admin clicks a report action.
 */
import { sb } from './shared.js';

window.NILTASK_PRIORITY_BANNER_REPORT_VERSION = 'v208.3';

const REPORT = { current: null, decorated: false };

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function ist(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }) + ' IST';
  } catch {
    return '—';
  }
}

function installStyles() {
  if (document.getElementById('pbr2083-css')) return;
  const style = document.createElement('style');
  style.id = 'pbr2083-css';
  style.textContent = `
    .pbr2083-wrap{position:fixed;inset:0;z-index:2147483500;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.58);backdrop-filter:blur(5px)}
    .pbr2083-wrap.open{display:flex}
    .pbr2083-card{width:min(960px,100%);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border-color);border-radius:20px;background:var(--bg-sidebar);box-shadow:0 24px 70px rgba(15,23,42,.32)}
    .pbr2083-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border-color)}
    .pbr2083-headcopy{flex:1;min-width:0}.pbr2083-headcopy b{display:block;color:var(--text-primary);font-size:16px}.pbr2083-headcopy small{display:block;margin-top:4px;color:var(--text-secondary);font-size:10px;line-height:1.45}
    .pbr2083-close{width:34px;height:34px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-body);color:var(--text-primary);cursor:pointer}
    .pbr2083-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid var(--border-color);background:var(--bg-body)}
    .pbr2083-tab{border:1px solid var(--border-color);border-radius:10px;padding:8px 11px;background:var(--bg-sidebar);color:var(--text-secondary);font-size:10px;font-weight:900;cursor:pointer}
    .pbr2083-tab.on{background:var(--accent);border-color:var(--accent);color:#fff}
    .pbr2083-pdf{margin-left:auto;border:0;border-radius:10px;padding:9px 13px;background:var(--accent);color:#fff;font-size:10px;font-weight:900;cursor:pointer}
    .pbr2083-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 18px}
    .pbr2083-stat{padding:11px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-body);text-align:center}.pbr2083-stat b{display:block;color:var(--text-primary);font-size:20px}.pbr2083-stat span{display:block;margin-top:3px;color:var(--text-secondary);font-size:9px;font-weight:800;text-transform:uppercase}
    .pbr2083-body{overflow:auto;padding:0 18px 18px}
    .pbr2083-table{width:100%;border-collapse:separate;border-spacing:0 7px}.pbr2083-table th{padding:4px 9px;color:var(--text-secondary);font-size:8px;text-align:left;text-transform:uppercase;letter-spacing:.06em}.pbr2083-table td{padding:10px 9px;background:var(--bg-body);border-top:1px solid var(--border-color);border-bottom:1px solid var(--border-color);color:var(--text-primary);font-size:10px;vertical-align:top}.pbr2083-table td:first-child{border-left:1px solid var(--border-color);border-radius:10px 0 0 10px}.pbr2083-table td:last-child{border-right:1px solid var(--border-color);border-radius:0 10px 10px 0}
    .pbr2083-status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:950}.pbr2083-status.ack{background:#dcfce7;color:#15803d}.pbr2083-status.pending{background:#fef3c7;color:#b45309}
    @media(max-width:700px){.pbr2083-wrap{padding:0}.pbr2083-card{width:100%;height:100%;max-height:none;border-radius:0}.pbr2083-summary{padding:10px}.pbr2083-body{padding:0 10px 90px}.pbr2083-tools{padding:9px 10px}.pbr2083-table th:nth-child(3),.pbr2083-table td:nth-child(3){display:none}.pbr2083-pdf{margin-left:0}}
  `;
  document.head.appendChild(style);
}

function ensureModal() {
  let wrap = document.getElementById('pbr2083Wrap');
  if (wrap) return wrap;

  wrap = document.createElement('div');
  wrap.id = 'pbr2083Wrap';
  wrap.className = 'pbr2083-wrap';
  wrap.innerHTML = `
    <section class="pbr2083-card">
      <div class="pbr2083-head">
        <div class="pbr2083-headcopy">
          <b data-pbr="title">Acknowledgement Report</b>
          <small data-pbr="meta">Priority Banner v208.3</small>
        </div>
        <button class="pbr2083-close" data-pbr-action="close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="pbr2083-tools">
        <button class="pbr2083-tab on" data-pbr-tab="all">All</button>
        <button class="pbr2083-tab" data-pbr-tab="acknowledged">Acknowledged</button>
        <button class="pbr2083-tab" data-pbr-tab="pending">Pending</button>
        <button class="pbr2083-pdf" data-pbr-action="pdf"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
      </div>
      <div class="pbr2083-summary">
        <div class="pbr2083-stat"><b data-pbr="total">0</b><span>Total</span></div>
        <div class="pbr2083-stat"><b data-pbr="ack">0</b><span>Acknowledged</span></div>
        <div class="pbr2083-stat"><b data-pbr="pending">0</b><span>Pending</span></div>
      </div>
      <div class="pbr2083-body" data-pbr="body"></div>
    </section>`;

  document.body.appendChild(wrap);
  wrap.addEventListener('click', async event => {
    if (event.target === wrap || event.target.closest('[data-pbr-action="close"]')) {
      wrap.classList.remove('open');
      return;
    }
    const tab = event.target.closest('[data-pbr-tab]');
    if (tab) {
      wrap.querySelectorAll('[data-pbr-tab]').forEach(x => x.classList.toggle('on', x === tab));
      renderRows(tab.dataset.pbrTab);
      return;
    }
    if (event.target.closest('[data-pbr-action="pdf"]') && REPORT.current) {
      await generatePdf(REPORT.current);
    }
  });
  return wrap;
}

async function fetchReport(bannerId) {
  const { data, error } = await sb.rpc('priority_banner_recipient_report', { p_banner_id: bannerId });
  if (error) throw error;

  let banner = {};
  const { data: rows } = await sb.rpc('admin_priority_banner_dashboard');
  if (Array.isArray(rows)) banner = rows.find(x => x.id === bannerId) || {};

  return { id: bannerId, banner, rows: Array.isArray(data) ? data : [] };
}

function renderRows(filter = 'all') {
  const wrap = ensureModal();
  const rows = REPORT.current?.rows || [];
  const filtered = rows.filter(row =>
    filter === 'all' ||
    (filter === 'acknowledged' ? Boolean(row.acknowledged_at) : !row.acknowledged_at)
  );

  const body = wrap.querySelector('[data-pbr="body"]');
  body.innerHTML = filtered.length ? `
    <table class="pbr2083-table">
      <thead><tr><th>User</th><th>Status</th><th>Department / Role</th><th>Delivered</th><th>Viewed</th><th>Acknowledged</th></tr></thead>
      <tbody>${filtered.map(row => `
        <tr>
          <td><b>${esc(row.full_name || row.email || 'User')}</b><br><small style="color:var(--text-secondary)">${esc(row.email || '')}</small></td>
          <td><span class="pbr2083-status ${row.acknowledged_at ? 'ack' : 'pending'}">${row.acknowledged_at ? 'Acknowledged' : 'Pending'}</span></td>
          <td>${esc([row.department, row.role_name].filter(Boolean).join(' · ') || '—')}</td>
          <td>${esc(ist(row.delivered_at))}</td>
          <td>${esc(ist(row.viewed_at))}</td>
          <td>${esc(ist(row.acknowledged_at))}</td>
        </tr>`).join('')}</tbody>
    </table>` : '<div style="padding:28px;text-align:center;color:var(--text-secondary);font-size:12px">No recipients in this category.</div>';
}

async function openReport(bannerId) {
  const wrap = ensureModal();
  wrap.classList.add('open');
  wrap.querySelector('[data-pbr="body"]').innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-secondary)"><i class="fa-solid fa-spinner fa-spin"></i> Loading report…</div>';

  try {
    REPORT.current = await fetchReport(bannerId);
    const { banner, rows } = REPORT.current;
    const acknowledged = rows.filter(row => row.acknowledged_at).length;

    wrap.querySelector('[data-pbr="title"]').textContent = banner.title || 'Priority Banner Report';
    wrap.querySelector('[data-pbr="meta"]').textContent = `${banner.category || 'Banner'} · Created ${ist(banner.created_at)} · Generated ${ist(new Date().toISOString())}`;
    wrap.querySelector('[data-pbr="total"]').textContent = rows.length;
    wrap.querySelector('[data-pbr="ack"]').textContent = acknowledged;
    wrap.querySelector('[data-pbr="pending"]').textContent = rows.length - acknowledged;
    wrap.querySelectorAll('[data-pbr-tab]').forEach(x => x.classList.toggle('on', x.dataset.pbrTab === 'all'));
    renderRows('all');
  } catch (error) {
    wrap.querySelector('[data-pbr="body"]').innerHTML = `<div style="padding:28px;color:#dc2626;font-size:12px">${esc(error.message || 'Report could not be loaded.')}</div>`;
  }
}

async function loadJsPdf() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const existing = document.getElementById('pbr2083-jspdf');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'pbr2083-jspdf';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.jspdf.jsPDF;
}

async function generatePdf(report) {
  const jsPDF = await loadJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rows = report.rows || [];
  const banner = report.banner || {};
  const acknowledged = rows.filter(row => row.acknowledged_at).length;
  let y = 16;
  let page = 1;

  function header() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('PRIORITY BANNER ACKNOWLEDGEMENT REPORT', 14, y);
    y += 8;
    doc.setFontSize(12);
    doc.text(String(banner.title || 'Priority Banner'), 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Category: ${banner.category || '—'} | Created: ${ist(banner.created_at)}`, 14, y);
    y += 5;
    doc.text(`Total: ${rows.length} | Acknowledged: ${acknowledged} | Pending: ${rows.length - acknowledged}`, 14, y);
    y += 7;
    doc.line(14, y, 196, y);
    y += 6;
  }

  function footer() {
    doc.setFontSize(8);
    doc.text(`Generated ${ist(new Date().toISOString())}`, 14, 290);
    doc.text(`Page ${page}`, 184, 290);
  }

  function nextPage() {
    footer();
    doc.addPage();
    page += 1;
    y = 16;
    header();
  }

  header();
  rows.forEach((row, index) => {
    if (y > 268) nextPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`${index + 1}. ${row.full_name || row.email || 'User'}`, 14, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Status: ${row.acknowledged_at ? 'Acknowledged' : 'Pending'} | Department/Role: ${[row.department, row.role_name].filter(Boolean).join(' / ') || '—'}`, 18, y);
    y += 4;
    doc.text(`Delivered: ${ist(row.delivered_at)}`, 18, y);
    y += 4;
    doc.text(`Viewed: ${ist(row.viewed_at)} | Acknowledged: ${ist(row.acknowledged_at)}`, 18, y);
    y += 6;
    doc.setDrawColor(220);
    doc.line(14, y, 196, y);
    y += 5;
  });
  footer();

  const safeName = String(banner.title || 'priority-banner')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  doc.save(`${safeName || 'priority-banner'}-acknowledgement-report.pdf`);
}

async function downloadReport(bannerId) {
  try {
    const report = REPORT.current?.id === bannerId ? REPORT.current : await fetchReport(bannerId);
    REPORT.current = report;
    await generatePdf(report);
  } catch (error) {
    window.alert(error.message || 'PDF report could not be generated.');
  }
}

function decorate() {
  const sections = document.querySelectorAll('.apb208');
  if (!sections.length) return false;

  sections.forEach(section => {
    section.querySelectorAll('[data-apb-action="pending"]').forEach(button => {
      button.dataset.apbAction = 'report2083';
      button.innerHTML = '<i class="fa-solid fa-chart-column"></i> View Report';
    });

    section.querySelectorAll('.apb208-item').forEach(item => {
      const actions = item.querySelector('.apb208-actions');
      const source = actions?.querySelector('[data-id]');
      if (!actions || !source || actions.querySelector('[data-apb-action="pdf2083"]')) return;
      const pdf = document.createElement('button');
      pdf.className = 'apb208-btn apb208-muted';
      pdf.dataset.apbAction = 'pdf2083';
      pdf.dataset.id = source.dataset.id;
      pdf.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Download PDF';
      actions.insertBefore(pdf, actions.querySelector('[data-apb-action="withdraw"]'));
    });
  });
  return true;
}

function boot() {
  installStyles();
  ensureModal();

  document.addEventListener('click', async event => {
    const reportButton = event.target.closest('[data-apb-action="report2083"]');
    if (reportButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await openReport(reportButton.dataset.id);
      return;
    }

    const pdfButton = event.target.closest('[data-apb-action="pdf2083"]');
    if (pdfButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await downloadReport(pdfButton.dataset.id);
    }
  }, true);

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    decorate();
    if (attempts >= 30) clearInterval(timer);
  }, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

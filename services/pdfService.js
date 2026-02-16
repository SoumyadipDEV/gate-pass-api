const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'pdf', 'gatepass.html');

let cachedTemplate = null;
let browserPromise = null;

function isReturnable(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '0';
  return Boolean(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDisplayDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildItemsRows(items = []) {
  if (!items.length) {
    return '<tr><td colspan="6" style="padding:8px; color:#6b7280;">No items provided.</td></tr>';
  }

  return items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.slNo)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.makeItem || '-')}</td>
        <td>${escapeHtml(item.model || '')}</td>
        <td>${escapeHtml(item.serialNo || '')}</td>
        <td>${escapeHtml(item.qty)}</td>
      </tr>`
    )
    .join('\n');
}

async function loadTemplate() {
  if (!cachedTemplate) {
    cachedTemplate = await fs.promises.readFile(TEMPLATE_PATH, 'utf8');
  }
  return cachedTemplate;
}

function injectTemplate(template, data) {
  return template.replace(/{{\s*([\w]+)\s*}}/g, (_, key) => (data[key] !== undefined ? data[key] : ''));
}

function normalizeGatePass(gatePass) {
  const normalizeDate = (v) => (v ? new Date(v).toISOString() : null);
  const items = Array.isArray(gatePass.items) ? [...gatePass.items] : [];
  const normalizedItems = items
    .map((i) => ({
      slNo: Number(i.slNo ?? 0),
      description: String(i.description ?? ''),
      makeItem: String(i.makeItem ?? ''),
      model: String(i.model ?? ''),
      serialNo: String(i.serialNo ?? ''),
      qty: Number(i.qty ?? 0),
    }))
    .sort((a, b) => {
      if (a.slNo !== b.slNo) return a.slNo - b.slNo;
      return a.description.localeCompare(b.description);
    });

  return {
    gatepassNo: gatePass.gatepassNo ?? gatePass.gatePassNo ?? '',
    date: normalizeDate(gatePass.date),
    destination: gatePass.destination ?? '',
    carriedBy: gatePass.carriedBy ?? '',
    through: gatePass.through ?? '',
    mobileNo: gatePass.mobileNo ?? '',
    createdBy: gatePass.createdBy ?? '',
    modifiedBy: gatePass.modifiedBy ?? '',
    modifiedAt: normalizeDate(gatePass.modifiedAt),
    returnable: isReturnable(gatePass.returnable),
    items: normalizedItems,
  };
}

function computeGatePassEtag(gatePass) {
  const normalized = normalizeGatePass(gatePass);
  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json).digest('hex');
}

async function generateGatePassHtml(gatePass) {
  const template = await loadTemplate();
  const itemsRows = buildItemsRows(gatePass.items);
  const templateData = {
    gatepassNo: escapeHtml(gatePass.gatepassNo || gatePass.gatePassNo || ''),
    returnableLabel: isReturnable(gatePass.returnable) ? '(Returnable Items)' : '',
    date: formatDisplayDate(gatePass.modifiedAt ?? gatePass.date),
    destination: escapeHtml(gatePass.destination ?? ''),
    carriedBy: escapeHtml(gatePass.carriedBy ?? ''),
    through: escapeHtml(gatePass.through ?? ''),
    mobileNo: escapeHtml(gatePass.mobileNo ?? '-'),
    itemsRows,
    logoDataUri:
      gatePass.logoDataUri ||
      process.env.LOGO_DATA_URI ||
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="%23e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%236b7280" font-family="Segoe UI, Arial" font-size="16">Logo</text></svg>',
  };

  return injectTemplate(template, templateData);
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

async function generateGatePassPdf(gatePass) {
  const html = await generateGatePassHtml(gatePass);
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: 794, height: 1024 } });

  await page.setContent(html, { waitUntil: 'networkidle' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' },
    preferCSSPageSize: true,
  });

  await page.close();
  return pdfBuffer;
}

module.exports = {
  generateGatePassPdf,
  computeGatePassEtag,
  isReturnable,
};

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { alertRecipients, alertSubjects } = require('../config/mailConfig');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'email');

// Create a single transporter instance that can be reused across the app.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const ALERT_TYPES = {
  CREATED: 'GATEPASS_CREATED',
  UPDATED: 'GATEPASS_UPDATED',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildItemsRows(items = []) {
  if (!items.length) {
    return '<tr><td colspan="5" style="padding: 8px; color: #6b7280;">No line items provided.</td></tr>';
  }

  return items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.slNo)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.model)}</td>
        <td>${escapeHtml(item.serialNo)}</td>
        <td>${escapeHtml(item.qty)}</td>
      </tr>`
    )
    .join('');
}

function buildGatePassTemplateData(alertType, gatePass) {
  const isCreate = alertType === ALERT_TYPES.CREATED;
  const enableRow =
    !isCreate && gatePass?.isEnable !== undefined && gatePass?.isEnable !== null
      ? `
        <tr>
          <td class="label">Enable / Disable</td>
          <td>${gatePass.isEnable ? 'Enabled' : 'Disabled'}</td>
        </tr>`
      : '';

  return {
    eventLabel: isCreate ? 'New Gate Pass Created' : 'Gate Pass Updated',
    title: gatePass?.gatepassNo ? `Gate Pass ${escapeHtml(gatePass.gatepassNo)}` : 'Gate Pass Alert',
    summary: isCreate
      ? 'A new gate pass was created. Details are attached below.'
      : 'An existing gate pass has been updated. Review the changes below.',
    destination: escapeHtml(gatePass?.destination),
    carriedBy: escapeHtml(gatePass?.carriedBy),
    through: escapeHtml(gatePass?.through),
    mobileNo: escapeHtml(gatePass?.mobileNo),
    createdBy: escapeHtml(gatePass?.createdBy || gatePass?.modifiedBy),
    date: formatDate(gatePass?.date),
    itemsRows: buildItemsRows(gatePass?.items),
    alertTimestamp: formatDate(new Date()),
    enableRow,
  };
}

function populateTemplate(template, replacements) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const value = key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), replacements);
    return value ?? '';
  });
}

async function renderTemplate(templateName, templateData) {
  const filePath = path.join(TEMPLATE_DIR, templateName);
  const raw = await fs.promises.readFile(filePath, 'utf8');
  return populateTemplate(raw, templateData);
}

async function sendEmail({ to, subject, templateName, templateData }) {
  if (!to || !to.length) {
    console.warn('MailService: No recipients configured for this alert. Email skipped.');
    return { skipped: true };
  }

  const html = await renderTemplate(templateName, templateData);

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to.join(','),
      subject,
      html,
    });

    console.log(`MailService: Email sent to ${to.join(', ')} (messageId: ${info.messageId})`);
    return { messageId: info.messageId, accepted: info.accepted };
  } catch (error) {
    // Log and rethrow so callers can decide whether to swallow or act on failures.
    console.error('MailService: Failed to send email:', error);
    throw error;
  }
}

async function sendGatePassAlert(alertType, gatePassData) {
  const recipients = alertRecipients[alertType] && alertRecipients[alertType].length
    ? alertRecipients[alertType]
    : alertRecipients.DEFAULT;

  const templateData = buildGatePassTemplateData(alertType, gatePassData);
  const subject = alertSubjects[alertType] || 'Gate Pass Alert';

  return sendEmail({
    to: recipients,
    subject,
    templateName: 'gatepass-alert.html',
    templateData,
  });
}

async function sendGatePassCreatedAlert(gatePassData) {
  return sendGatePassAlert(ALERT_TYPES.CREATED, gatePassData);
}

async function sendGatePassUpdatedAlert(gatePassData) {
  return sendGatePassAlert(ALERT_TYPES.UPDATED, gatePassData);
}

module.exports = {
  sendGatePassCreatedAlert,
  sendGatePassUpdatedAlert,
};

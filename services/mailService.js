const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { alertRecipients, alertSubjects } = require('../config/mailConfig');
const { getConnection, sql } = require('../config/database');
const { ensureGatePassPdf } = require('./pdfCacheService');

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
    return '<tr><td colspan="6" style="padding: 8px; color: #6b7280;">No line items provided.</td></tr>';
  }

  return items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.slNo)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.makeItem)}</td>
        <td>${escapeHtml(item.model)}</td>
        <td>${escapeHtml(item.serialNo)}</td>
        <td>${escapeHtml(item.qty)}</td>
      </tr>`
    )
    .join('');
}

function buildGatePassTemplateData(alertType, gatePass) {
  const isCreate = alertType === ALERT_TYPES.CREATED;
  const createdByRow = gatePass?.createdBy
    ? `
        <tr>
          <td class="label">Created By</td>
          <td>${escapeHtml(gatePass.createdBy)}</td>
        </tr>`
    : '';

  const modifiedByRow = gatePass?.modifiedBy
    ? `
        <tr>
          <td class="label">Modified By</td>
          <td>${escapeHtml(gatePass.modifiedBy)}</td>
        </tr>`
    : '';

  const enableRow =
    !isCreate && gatePass?.isEnable !== undefined && gatePass?.isEnable !== null
      ? `
        <tr>
          <td class="label">Enable / Disable</td>
          <td>${gatePass.isEnable ? 'Enabled' : 'Disabled'}</td>
        </tr>`
      : '';

  const returnableRow =
    gatePass?.returnable !== undefined && gatePass?.returnable !== null
      ? `
        <tr>
          <td class="label">Returnable</td>
          <td>${gatePass.returnable ? 'Yes' : 'No'}</td>
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
    createdByRow,
    modifiedByRow,
    enableRow,
    returnableRow,
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

async function buildPdfAttachment(gatePassData) {
  try {
    const { pdfBase64 } = await ensureGatePassPdf(gatePassData);
    const filenamePart =
      gatePassData?.gatepassNo ||
      gatePassData?.gatePassNo ||
      gatePassData?.id ||
      gatePassData?.GatePassID ||
      'gatepass';

    return {
      filename: `gatepass-${filenamePart}.pdf`,
      content: Buffer.from(pdfBase64, 'base64'),
      contentType: 'application/pdf',
    };
  } catch (error) {
    console.error('MailService: Failed to build PDF attachment:', error);
    return null;
  }
}


async function lookupDestinationEmail(gatePass) {
  const pool = await getConnection();

  // Highest confidence: explicit destinationId from frontend.
  if (gatePass?.destinationId) {
    const byId = await pool
      .request()
      .input('id', sql.Int, gatePass.destinationId)
      .query('SELECT EmailID FROM GatePassDestinationTable WHERE Id = @id');

    if (byId.recordset[0]?.EmailID) {
      return byId.recordset[0].EmailID;
    }
  }

  // Fallback: try destinationCode (if UI sends it) or the human-readable destination name.
  const lookupValue = gatePass?.destinationCode || gatePass?.destination;
  if (lookupValue) {
    const byCodeOrName = await pool
      .request()
      .input('lookup', sql.NVarChar, lookupValue)
      .query('SELECT TOP 1 EmailID FROM GatePassDestinationTable WHERE DestinationCode = @lookup OR DestinationName = @lookup');

    if (byCodeOrName.recordset[0]?.EmailID) {
      return byCodeOrName.recordset[0].EmailID;
    }
  }

  return null;
}


async function sendEmail({ to, subject, templateName, templateData, attachments }) {
  if (!to || !to.length) {
    console.warn('MailService: No recipients configured for this alert. Email skipped.');
    return { skipped: true };
  }

  const html = await renderTemplate(templateName, templateData);
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: to.join(','),
    subject,
    html,
  };

  if (attachments && attachments.length) {
    mailOptions.attachments = attachments;
  }

  try {
    const info = await transporter.sendMail(mailOptions);

    console.log(`MailService: Email sent to ${to.join(', ')} (messageId: ${info.messageId})`);
    return { messageId: info.messageId, accepted: info.accepted };
  } catch (error) {
    // Log and rethrow so callers can decide whether to swallow or act on failures.
    console.error('MailService: Failed to send email:', error);
    throw error;
  }
}

async function sendGatePassAlert(alertType, gatePassData) {
  const baseRecipients = alertRecipients[alertType] && alertRecipients[alertType].length
    ? alertRecipients[alertType]
    : alertRecipients.DEFAULT;

  const destEmail = await lookupDestinationEmail(gatePassData);
  const recipients = [...new Set([...baseRecipients, ...(destEmail ? [destEmail] : [])])];

  const templateData = buildGatePassTemplateData(alertType, gatePassData);
  const subject = alertSubjects[alertType] || 'Gate Pass Alert';
  const pdfAttachment = alertType === ALERT_TYPES.CREATED ? await buildPdfAttachment(gatePassData) : null;

  return sendEmail({
    to: recipients,
    subject,
    templateName: 'gatepass-alert.html',
    templateData,
    attachments: pdfAttachment ? [pdfAttachment] : undefined,
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

require('dotenv').config();

// Central place to manage who receives which alerts.
// Update the arrays below (or the ALERT_RECIPIENTS env var) when new stakeholders are added.
const defaultRecipients = (process.env.ALERT_RECIPIENTS || process.env.SMTP_USER || '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);

const alertRecipients = {
  GATEPASS_CREATED: defaultRecipients,
  GATEPASS_UPDATED: defaultRecipients,
  DEFAULT: defaultRecipients,
};

const alertSubjects = {
  GATEPASS_CREATED: 'New Gate Pass Created',
  GATEPASS_UPDATED: 'Gate Pass Updated',
};

module.exports = {
  alertRecipients,
  alertSubjects,
};

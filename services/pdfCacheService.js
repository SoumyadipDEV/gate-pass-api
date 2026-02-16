const { getConnection, sql } = require('../config/database');
const { computeGatePassEtag, generateGatePassPdf } = require('./pdfService');

async function getCachedPdf(gatePassID) {
  const pool = await getConnection();
  const result = await pool
    .request()
    .input('gatePassID', sql.NVarChar, gatePassID)
    .query('SELECT GatePassID, ETag, PdfBase64 FROM GatePassPdf WHERE GatePassID = @gatePassID');

  if (!result.recordset.length) return null;
  return {
    gatePassID: result.recordset[0].GatePassID,
    etag: result.recordset[0].ETag,
    pdfBase64: result.recordset[0].PdfBase64,
  };
}

async function upsertPdf(gatePassID, etag, pdfBase64) {
  const pool = await getConnection();
  await pool
    .request()
    .input('gatePassID', sql.NVarChar, gatePassID)
    .input('etag', sql.Char, etag)
    .input('pdfBase64', sql.NVarChar(sql.MAX), pdfBase64)
    .query(`
      MERGE GatePassPdf AS target
      USING (VALUES (@gatePassID, @etag, @pdfBase64)) AS src (GatePassID, ETag, PdfBase64)
      ON target.GatePassID = src.GatePassID
      WHEN MATCHED THEN
        UPDATE SET ETag = src.ETag, PdfBase64 = src.PdfBase64, UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (GatePassID, ETag, PdfBase64, CreatedAt, UpdatedAt)
        VALUES (src.GatePassID, src.ETag, src.PdfBase64, SYSUTCDATETIME(), SYSUTCDATETIME());
    `);
}

async function ensureGatePassPdf(gatePassData) {
  const gatePassID = gatePassData?.id || gatePassData?.GatePassID;
  if (!gatePassID) {
    throw new Error('Gate pass ID is required to generate PDF.');
  }

  const etag = computeGatePassEtag(gatePassData);
  const cached = await getCachedPdf(gatePassID);

  if (cached && cached.etag === etag) {
    return { etag, pdfBase64: cached.pdfBase64 };
  }

  const pdfBuffer = await generateGatePassPdf(gatePassData);
  const pdfBase64 = pdfBuffer.toString('base64');

  await upsertPdf(gatePassID, etag, pdfBase64);
  return { etag, pdfBase64 };
}

module.exports = {
  getCachedPdf,
  ensureGatePassPdf,
};

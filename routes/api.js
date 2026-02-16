const express = require('express');
const router = express.Router();
const {
  createLogin,
  loginUser,
  getGatePasses,
  getGatePassById,
  createGatePass,
  deleteGatePass,
  updateGatePass,
  createDestination,
  getDestinations,
} = require('../controllers/gatePassController');
const { sendGatePassCreatedAlert, sendGatePassUpdatedAlert } = require('../services/mailService');
const { getCachedPdf, ensureGatePassPdf } = require('../services/pdfCacheService');

// Login endpoint
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const result = await loginUser(email, password);
    const statusCode = result.success ? 200 : 401;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Login endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Get all gate passes
router.get('/gatepass', async (req, res) => {
  try {
    const result = await getGatePasses();
    res.status(200).json(result);
  } catch (error) {
    console.error('Get gate passes endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Download gate pass PDF (cached with ETag)
router.get('/gatepass/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Gate pass ID is required' });
    }

    const latest = await getGatePassById(id);
    if (!latest.success) {
      return res.status(404).json({ success: false, message: 'Gate pass not found' });
    }

    // Ensure cache is fresh on read: regenerate only if ETag differs.
    const { etag, pdfBase64 } = await ensureGatePassPdf(latest.data);

    if (req.headers['if-none-match'] && req.headers['if-none-match'].replace(/"/g, '') === etag) {
      return res.status(304).end();
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="gatepass-${id}.pdf"`,
      ETag: `"${etag}"`,
      'Cache-Control': 'private, max-age=0',
    });
    return res.send(Buffer.from(pdfBase64, 'base64'));
  } catch (error) {
    console.error('Download gate pass PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Create gate pass
router.post('/gatepass', async (req, res) => {
  try {
    const gatePassData = req.body;

    // Validation
    if (
      !gatePassData.id ||
      !gatePassData.gatepassNo ||
      !gatePassData.date ||
      !gatePassData.destination ||
      !gatePassData.destinationId ||
      !gatePassData.carriedBy ||
      !gatePassData.through ||
      !gatePassData.mobileNo ||
      !gatePassData.createdBy ||
      !gatePassData.items ||
      gatePassData.items.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Validate items
    for (const item of gatePassData.items) {
      if (
        item.slNo === undefined ||
        !item.description ||
        !item.makeItem ||
        !item.model ||
        !item.serialNo ||
        item.qty === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item structure',
        });
      }
    }

    const result = await createGatePass(gatePassData);

    // Fire-and-forget email and PDF warm (use DB snapshot for consistency) to avoid blocking the response path.
    setImmediate(async () => {
      try {
        await sendGatePassCreatedAlert(gatePassData);
      } catch (mailError) {
        console.error('Create gate pass alert email failed:', mailError);
      }

      try {
        const latest = await getGatePassById(gatePassData.id);
        if (latest.success) {
          await ensureGatePassPdf(latest.data);
        }
      } catch (pdfError) {
        console.error('Create gate pass PDF generation failed:', pdfError);
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create gate pass endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Update gate pass
router.patch('/gatepass', async (req, res) => {
  try {
    const gatePassData = req.body;

    // Validation
    if (
      !gatePassData.id ||
      !gatePassData.gatepassNo ||
      !gatePassData.date ||
      !gatePassData.destination ||
      !gatePassData.destinationId ||
      !gatePassData.carriedBy ||
      !gatePassData.through ||
      !gatePassData.mobileNo ||
      !gatePassData.items ||
      gatePassData.items.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Validate items
    for (const item of gatePassData.items) {
      if (
        item.slNo === undefined ||
        !item.description ||
        !item.makeItem ||
        !item.model ||
        !item.serialNo ||
        item.qty === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item structure',
        });
      }
    }

    const result = await updateGatePass(gatePassData);

    if (result.success) {
      setImmediate(async () => {
        try {
          await sendGatePassUpdatedAlert(gatePassData);
        } catch (mailError) {
          console.error('Update gate pass alert email failed:', mailError);
        }

        try {
          const latest = await getGatePassById(gatePassData.id);
          if (latest.success) {
            await ensureGatePassPdf(latest.data);
          }
        } catch (pdfError) {
          console.error('Update gate pass PDF generation failed:', pdfError);
        }
      });
    }

    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Update gate pass endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Create destination
router.post('/dest/create', async (req, res) => {
  try {
    const destinationData = req.body;

    if (!destinationData.destinationName || !destinationData.destinationCode) {
      return res.status(400).json({
        success: false,
        message: 'destinationName and destinationCode are required',
      });
    }

    const result = await createDestination(destinationData);
    const statusCode = result.success ? 201 : result.message && result.message.includes('exists') ? 409 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Create destination endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Get all destinations
router.get('/dest', async (req, res) => {
  try {
    const result = await getDestinations();
    res.status(200).json(result);
  } catch (error) {
    console.error('Get destinations endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Create login/user endpoint
router.post('/createlogin', async (req, res) => {
  try {
    const userData = req.body;

    const result = await createLogin(userData);
    const statusCode = result.success ? 201 : result.message && result.message.includes('exists') ? 409 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Create login endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Delete gate pass
router.delete('/gatepassdelete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Gate pass ID is required',
      });
    }

    const result = await deleteGatePass(id);
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('Delete gate pass endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

module.exports = router;

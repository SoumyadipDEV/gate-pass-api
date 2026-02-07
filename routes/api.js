const express = require('express');
const router = express.Router();
const { createLogin, loginUser, getGatePasses, createGatePass, deleteGatePass, updateGatePass } = require('../controllers/gatePassController');
const { sendGatePassCreatedAlert, sendGatePassUpdatedAlert } = require('../services/mailService');

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

    // Fire-and-forget email to avoid blocking the response path.
    setImmediate(() => {
      sendGatePassCreatedAlert(gatePassData).catch((mailError) =>
        console.error('Create gate pass alert email failed:', mailError)
      );
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
      setImmediate(() => {
        sendGatePassUpdatedAlert(gatePassData).catch((mailError) =>
          console.error('Update gate pass alert email failed:', mailError)
        );
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

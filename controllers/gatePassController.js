const { getConnection, sql } = require('../config/database');

// Login API
async function loginUser(email, password) {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, password)
      .query(`
        SELECT UserId, Email, UserName 
        FROM UserDetails 
        WHERE Email = @email 
          AND Password = @password 
          AND IsActive = 1
      `);

    if (result.recordset.length > 0) {
      return {
        success: true,
        message: 'Login successful',
        user: {
          userId: result.recordset[0].UserId,
          userName: result.recordset[0].UserName,
          email: result.recordset[0].Email,
        },
      };
    } else {
      return {
        success: false,
        message: 'Invalid email or password',
      };
    }
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// Get all gate passes with line items
async function getGatePasses() {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        h.GatePassID,
        h.GatePassNo,
        h.Date,
        h.Destination,
        h.CarriedBy,
        h.Through,
        h.CreatedBy,
        h.CreatedAt,
        l.LineItemID,
        l.SlNo,
        l.Description,
        l.Model,
        l.SerialNo,
        l.Qty
      FROM GatePassHeader h
      LEFT JOIN GatePassLineItems l ON h.GatePassID = l.GatePassID
      ORDER BY h.CreatedAt DESC, l.SlNo ASC
    `);

    // Transform flat result into nested structure
    const gatePassMap = new Map();

    result.recordset.forEach((row) => {
      if (!gatePassMap.has(row.GatePassID)) {
        gatePassMap.set(row.GatePassID, {
          gatepassNo: row.GatePassNo,
          date: row.Date,
          items: [],
          destination: row.Destination,
          carriedBy: row.CarriedBy,
          through: row.Through,
          id: row.GatePassID,
          createdBy: row.CreatedBy,
          createdAt: row.CreatedAt,
        });
      }

      if (row.LineItemID) {
        gatePassMap.get(row.GatePassID).items.push({
          slNo: row.SlNo,
          description: row.Description,
          model: row.Model,
          serialNo: row.SerialNo,
          qty: row.Qty,
        });
      }
    });

    return {
      success: true,
      data: Array.from(gatePassMap.values()),
    };
  } catch (error) {
    console.error('Get gate passes error:', error);
    throw error;
  }
}

// Create new gate pass
async function createGatePass(gatePassData) {
  try {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      // Insert header
      await transaction
        .request()
        .input('gatePassID', sql.NVarChar, gatePassData.id)
        .input('gatePassNo', sql.NVarChar, gatePassData.gatepassNo)
        .input('date', sql.DateTime, new Date(gatePassData.date))
        .input('destination', sql.NVarChar, gatePassData.destination)
        .input('carriedBy', sql.NVarChar, gatePassData.carriedBy)
        .input('through', sql.NVarChar, gatePassData.through)
        .input('createdBy', sql.NVarChar, gatePassData.createdBy)
        .input('createdAt', sql.DateTime, new Date())
        .query(`
          INSERT INTO GatePassHeader 
            (GatePassID, GatePassNo, Date, Destination, CarriedBy, Through, CreatedBy, CreatedAt)
          VALUES 
            (@gatePassID, @gatePassNo, @date, @destination, @carriedBy, @through, @createdBy, @createdAt)
        `);

      // Insert line items
      for (const item of gatePassData.items) {
        await transaction
          .request()
          .input('gatePassID', sql.NVarChar, gatePassData.id)
          .input('slNo', sql.Int, item.slNo)
          .input('description', sql.NVarChar, item.description)
          .input('model', sql.NVarChar, item.model)
          .input('serialNo', sql.NVarChar, item.serialNo)
          .input('qty', sql.Int, item.qty)
          .query(`
            INSERT INTO GatePassLineItems 
              (GatePassID, SlNo, Description, Model, SerialNo, Qty)
            VALUES 
              (@gatePassID, @slNo, @description, @model, @serialNo, @qty)
          `);
      }

      await transaction.commit();

      return {
        success: true,
        message: 'Gate pass created successfully',
        gatePassId: gatePassData.id,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Create gate pass error:', error);
    throw error;
  }
}

// Delete gate pass
async function deleteGatePass(gatePassID) {
  try {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      // Delete line items first
      await transaction
        .request()
        .input('gatePassID', sql.NVarChar, gatePassID)
        .query(`
          DELETE FROM GatePassLineItems
          WHERE GatePassID = @gatePassID
        `);

      // Delete header
      const result = await transaction
        .request()
        .input('gatePassID', sql.NVarChar, gatePassID)
        .query(`
          DELETE FROM GatePassHeader
          WHERE GatePassID = @gatePassID
        `);

      await transaction.commit();

      // Check if any rows were affected
      if (result.rowsAffected[0] === 0) {
        return {
          success: false,
          message: 'Gate pass not found',
        };
      }

      return {
        success: true,
        message: 'Gate pass deleted successfully',
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Delete gate pass error:', error);
    throw error;
  }
}

// Update existing gate pass
async function updateGatePass(gatePassData) {
  try {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      // Update header
      const headerResult = await transaction
        .request()
        .input('gatePassID', sql.NVarChar, gatePassData.id)
        .input('gatePassNo', sql.NVarChar, gatePassData.gatepassNo)
        .input('date', sql.DateTime, new Date(gatePassData.date))
        .input('destination', sql.NVarChar, gatePassData.destination)
        .input('carriedBy', sql.NVarChar, gatePassData.carriedBy)
        .input('through', sql.NVarChar, gatePassData.through)
        .query(`
          UPDATE GatePassHeader
          SET GatePassNo = @gatePassNo,
              Date = @date,
              Destination = @destination,
              CarriedBy = @carriedBy,
              Through = @through
          WHERE GatePassID = @gatePassID
        `);

      if (headerResult.rowsAffected[0] === 0) {
        await transaction.rollback();
        return {
          success: false,
          message: 'Gate pass not found',
        };
      }

      // Replace line items
      await transaction
        .request()
        .input('gatePassID', sql.NVarChar, gatePassData.id)
        .query(`
          DELETE FROM GatePassLineItems
          WHERE GatePassID = @gatePassID
        `);

      for (const item of gatePassData.items) {
        await transaction
          .request()
          .input('gatePassID', sql.NVarChar, gatePassData.id)
          .input('slNo', sql.Int, item.slNo)
          .input('description', sql.NVarChar, item.description)
          .input('model', sql.NVarChar, item.model)
          .input('serialNo', sql.NVarChar, item.serialNo)
          .input('qty', sql.Int, item.qty)
          .query(`
            INSERT INTO GatePassLineItems 
              (GatePassID, SlNo, Description, Model, SerialNo, Qty)
            VALUES 
              (@gatePassID, @slNo, @description, @model, @serialNo, @qty)
          `);
      }

      await transaction.commit();

      return {
        success: true,
        message: 'Gate pass updated successfully',
        gatePassId: gatePassData.id,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Update gate pass error:', error);
    throw error;
  }
}

module.exports = {
  loginUser,
  getGatePasses,
  createGatePass,
  deleteGatePass,
  updateGatePass,
};

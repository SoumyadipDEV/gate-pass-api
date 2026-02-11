const { getConnection, sql } = require('../config/database');

// Create a new login/user
async function createLogin(userData) {
  const { email, userName, password } = userData;
  const isActive = userData.isActive === undefined || userData.isActive === null ? 1 : Number(userData.isActive);

  if (!email || !userName || !password) {
    return { success: false, message: 'Email, userName and password are required' };
  }

  try {
    const pool = await getConnection();

    // Check if user already exists
    const existing = await pool
      .request()
      .input('email', sql.NVarChar, email)
      .query('SELECT UserId FROM UserDetails WHERE Email = @email');

    if (existing.recordset.length > 0) {
      return { success: false, message: 'User already exists with this email' };
    }

    const insertResult = await pool
      .request()
      .input('email', sql.NVarChar, email)
      .input('userName', sql.NVarChar, userName)
      .input('password', sql.NVarChar, password)
      .input('isActive', sql.Int, isActive)
      .query(`
        INSERT INTO UserDetails (Email, UserName, Password, IsActive)
        OUTPUT INSERTED.UserId
        VALUES (@email, @userName, @password, @isActive)
      `);

    return {
      success: true,
      message: 'User created successfully',
      userId: insertResult.recordset[0].UserId,
    };
  } catch (error) {
    console.error('Create login error:', error);
    throw error;
  }
}

function buildLineItemsInsertQuery(request, gatePassID, items) {
  request.input('gatePassID', sql.NVarChar, gatePassID);

  const values = items.map((item, index) => {
    request.input(`slNo${index}`, sql.Int, item.slNo);
    request.input(`description${index}`, sql.NVarChar, item.description);
    request.input(`makeItem${index}`, sql.NVarChar, item.makeItem);
    request.input(`model${index}`, sql.NVarChar, item.model);
    request.input(`serialNo${index}`, sql.NVarChar, item.serialNo);
    request.input(`qty${index}`, sql.Int, item.qty);

    return `(@gatePassID, @slNo${index}, @description${index}, @makeItem${index}, @model${index}, @serialNo${index}, @qty${index})`;
  });

  return `
    INSERT INTO GatePassLineItems (GatePassID, SlNo, Description, MakeItem, Model, SerialNo, Qty)
    VALUES ${values.join(',\n          ')}
  `;
}

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
        h.MobileNo,
        h.CreatedBy,
        h.CreatedAt,
        h.ModifiedBy,
        h.ModifiedAt,
        h.IsEnable,
        h.Returnable,
        l.LineItemID,
        l.SlNo,
        l.Description,
        l.MakeItem,
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
          mobileNo: row.MobileNo,
          id: row.GatePassID,
          createdBy: row.CreatedBy,
          createdAt: row.CreatedAt,
          modifiedBy: row.ModifiedBy,
          modifiedAt: row.ModifiedAt,
          isEnable: row.IsEnable,
          returnable: row.Returnable,
        });
      }

      if (row.LineItemID) {
        gatePassMap.get(row.GatePassID).items.push({
          slNo: row.SlNo,
          description: row.Description,
          makeItem: row.MakeItem,
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

    const modifiedBy = gatePassData.modifiedBy ?? null;
    const modifiedAt = gatePassData.modifiedAt ? new Date(gatePassData.modifiedAt) : null;
    const isEnable =
      gatePassData.isEnable === undefined || gatePassData.isEnable === null
        ? 1
        : Number(gatePassData.isEnable);
    const returnable =
      gatePassData.returnable === undefined || gatePassData.returnable === null
        ? 0
        : Number(gatePassData.returnable);

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
        .input('mobileNo', sql.NVarChar, gatePassData.mobileNo)
        .input('createdBy', sql.NVarChar, gatePassData.createdBy)
        .input('createdAt', sql.DateTime, new Date())
        .input('modifiedBy', sql.NVarChar, modifiedBy)
        .input('modifiedAt', sql.DateTime, modifiedAt)
        .input('isEnable', sql.Int, isEnable)
        .input('returnable', sql.Int, returnable)
        .query(`
          INSERT INTO GatePassHeader 
            (GatePassID, GatePassNo, Date, Destination, CarriedBy, Through, MobileNo, CreatedBy, CreatedAt, ModifiedBy, ModifiedAt, IsEnable, Returnable)
          VALUES 
            (@gatePassID, @gatePassNo, @date, @destination, @carriedBy, @through, @mobileNo, @createdBy, @createdAt, @modifiedBy, @modifiedAt, @isEnable, @returnable)
        `);

      // Insert line items in one round trip to reduce latency.
      const itemsRequest = transaction.request();
      const insertItemsQuery = buildLineItemsInsertQuery(itemsRequest, gatePassData.id, gatePassData.items);
      await itemsRequest.query(insertItemsQuery);

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

    const modifiedBy = gatePassData.modifiedBy ?? null;
    const modifiedAt = gatePassData.modifiedAt ? new Date(gatePassData.modifiedAt) : null;
    const isEnable =
      gatePassData.isEnable === undefined || gatePassData.isEnable === null
        ? null
        : Number(gatePassData.isEnable);
    const returnable =
      gatePassData.returnable === undefined || gatePassData.returnable === null
        ? null
        : Number(gatePassData.returnable);

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
        .input('mobileNo', sql.NVarChar, gatePassData.mobileNo)
        .input('modifiedBy', sql.NVarChar, modifiedBy)
        .input('modifiedAt', sql.DateTime, modifiedAt)
        .input('isEnable', sql.Int, isEnable)
        .input('returnable', sql.Int, returnable)
        .query(`
          UPDATE GatePassHeader
          SET GatePassNo = @gatePassNo,
              Date = @date,
              Destination = @destination,
              CarriedBy = @carriedBy,
              Through = @through,
              MobileNo = @mobileNo,
              ModifiedBy = COALESCE(@modifiedBy, ModifiedBy),
              ModifiedAt = COALESCE(@modifiedAt, ModifiedAt),
              IsEnable = COALESCE(@isEnable, IsEnable),
              Returnable = COALESCE(@returnable, Returnable)
          WHERE GatePassID = @gatePassID
        `);

      if (headerResult.rowsAffected[0] === 0) {
        await transaction.rollback();
        return {
          success: false,
          message: 'Gate pass not found',
        };
      }

      // Replace line items with a single bulk insert.
      await transaction
        .request()
        .input('gatePassID', sql.NVarChar, gatePassData.id)
        .query(`
          DELETE FROM GatePassLineItems
          WHERE GatePassID = @gatePassID
        `);

      const itemsRequest = transaction.request();
      const insertItemsQuery = buildLineItemsInsertQuery(itemsRequest, gatePassData.id, gatePassData.items);
      await itemsRequest.query(insertItemsQuery);

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
  createLogin,
  loginUser,
  getGatePasses,
  createGatePass,
  deleteGatePass,
  updateGatePass,
};

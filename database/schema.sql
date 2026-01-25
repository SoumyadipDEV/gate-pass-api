-- Create UserDetails table
CREATE TABLE UserDetails (
  UserId INT PRIMARY KEY IDENTITY(1,1),
  Email NVARCHAR(255) NOT NULL UNIQUE,
  Password NVARCHAR(255) NOT NULL,
  IsActive INT NOT NULL DEFAULT 1
);

-- Create GatePassHeader table
CREATE TABLE GatePassHeader (
  GatePassID NVARCHAR(50) PRIMARY KEY,
  GatePassNo NVARCHAR(50) NOT NULL,
  Date DATETIME NOT NULL,
  Destination NVARCHAR(255) NOT NULL,
  CarriedBy NVARCHAR(255) NOT NULL,
  Through NVARCHAR(255) NOT NULL,
  CreatedBy NVARCHAR(255) NOT NULL,
  CreatedAt DATETIME NOT NULL
);

-- Create GatePassLineItems table
CREATE TABLE GatePassLineItems (
  LineItemID INT PRIMARY KEY IDENTITY(1,1),
  GatePassID NVARCHAR(50) NOT NULL,
  SlNo INT NOT NULL,
  Description NVARCHAR(MAX) NOT NULL,
  Model NVARCHAR(255) NOT NULL,
  SerialNo NVARCHAR(255) NOT NULL,
  Qty INT NOT NULL,
  FOREIGN KEY (GatePassID) REFERENCES GatePassHeader(GatePassID)
);

-- Sample data for UserDetails
INSERT INTO UserDetails (Email, Password, IsActive)
VALUES 
  ('It.services@surakshanet.com', 'password123', 1),
  ('user@example.com', 'testpass', 1);

-- Sample data for GatePassHeader
INSERT INTO GatePassHeader (GatePassID, GatePassNo, Date, Destination, CarriedBy, Through, CreatedBy, CreatedAt)
VALUES 
  ('1769264370159-doch5ns1k', 'SDLGP20260124-6859', '2026-01-24T14:17:25.472Z', 'Phoolbagan (PHL)', 'Bhupen Shaoo', 'Logistics', 'It.services@surakshanet.com', '2026-01-24T14:19:30.159Z');

-- Sample data for GatePassLineItems
INSERT INTO GatePassLineItems (GatePassID, SlNo, Description, Model, SerialNo, Qty)
VALUES 
  ('1769264370159-doch5ns1k', 1, 'gfh', 'sfdg', 'sdgf', 1);

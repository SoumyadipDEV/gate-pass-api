# Gate Pass API

Node.js API server for managing gate pass records with MSSQL database integration.

## Features

- **Login API**: User authentication against UserDetails table
- **View Gate Pass API**: Fetch gate pass records with line items
- **Create Gate Pass API**: Insert new gate pass records

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the project root with the following configuration:
```
PORT=3000
MSSQL_SERVER=your-server-name
MSSQL_DATABASE=your-database-name
MSSQL_USER=your-username
MSSQL_PASSWORD=your-password
MSSQL_ENCRYPT=true
```

## Running the Server

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on the port specified in `.env` (default: 3000).

## API Endpoints

### 1. Login
**POST** `/api/auth/login`

Request body:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "userId": 1,
    "email": "user@example.com"
  }
}
```

### 2. View Gate Pass
**GET** `/api/gatepass`

Response:
```json
[
  {
    "gatepassNo": "SDLGP20260124-6859",
    "date": "2026-01-24T14:17:25.472Z",
    "items": [
      {
        "slNo": 1,
        "description": "gfh",
        "model": "sfdg",
        "serialNo": "sdgf",
        "qty": 1
      }
    ],
    "destination": "Phoolbagan (PHL)",
    "carriedBy": "Bhupen Shaoo",
    "through": "Logistics",
    "id": "1769264370159-doch5ns1k",
    "createdBy": "It.services@surakshanet.com",
    "createdAt": "2026-01-24T14:19:30.159Z"
  }
]
```

### 3. Create Gate Pass
**POST** `/api/gatepass`

Request body:
```json
{
  "gatepassNo": "SDLGP20260124-6859",
  "date": "2026-01-24T14:17:25.472Z",
  "items": [
    {
      "slNo": 1,
      "description": "gfh",
      "model": "sfdg",
      "serialNo": "sdgf",
      "qty": 1
    }
  ],
  "destination": "Phoolbagan (PHL)",
  "carriedBy": "Bhupen Shaoo",
  "through": "Logistics",
  "id": "1769264370159-doch5ns1k",
  "createdBy": "It.services@surakshanet.com"
}
```

Response:
```json
{
  "success": true,
  "message": "Gate pass created successfully",
  "gatePassId": "1769264370159-doch5ns1k"
}
```

## Database Schema

### UserDetails Table
```sql
CREATE TABLE UserDetails (
  UserId INT PRIMARY KEY IDENTITY(1,1),
  Email NVARCHAR(255),
  Password NVARCHAR(255),
  IsActive INT
);
```

### GatePassHeader Table
```sql
CREATE TABLE GatePassHeader (
  GatePassID NVARCHAR(50) PRIMARY KEY,
  GatePassNo NVARCHAR(50),
  Date DATETIME,
  Destination NVARCHAR(255),
  CarriedBy NVARCHAR(255),
  Through NVARCHAR(255),
  CreatedBy NVARCHAR(255),
  CreatedAt DATETIME
);
```

### GatePassLineItems Table
```sql
CREATE TABLE GatePassLineItems (
  LineItemID INT PRIMARY KEY IDENTITY(1,1),
  GatePassID NVARCHAR(50),
  SlNo INT,
  Description NVARCHAR(MAX),
  Model NVARCHAR(255),
  SerialNo NVARCHAR(255),
  Qty INT,
  FOREIGN KEY (GatePassID) REFERENCES GatePassHeader(GatePassID)
);
```

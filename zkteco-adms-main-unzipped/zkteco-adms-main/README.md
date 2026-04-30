# ZKTeco ADMS Bridge

A complete Node.js HTTP bridge for ZKTeco MB460 biometric devices implementing the full ADMS (Automatic Data Master Server) protocol that forwards data to a Vercel API endpoint.

## Features

- ✅ **Full ADMS Protocol Support** - Complete implementation of ZKTeco ADMS protocol
- ✅ **Express.js server** with ES Modules
- ✅ **Port 80** listening for ZKTeco devices
- ✅ **Multiple ADMS Endpoints**:
  - `GET /iclock/getoptions` - Device configuration
  - `GET /iclock/gettime` - Server time sync
  - `POST /iclock/setoptions` - Device settings
  - `POST /iclock/device` - Device registration
  - `GET /iclock/ping` - Device heartbeat
  - `POST /iclock/cdata` - Attendance data
  - `GET /iclock/info` - Server information
  - `GET /iclock/status` - Server status
  - `POST /iclock/command` - Device commands
- ✅ **Comprehensive logging** with device information
- ✅ **Vercel API forwarding** with enhanced headers
- ✅ **Health check endpoint** with endpoint documentation

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy the `.env` file and update the configuration:

   ```bash
   cp .env .env.local
   ```

   Edit `.env.local` with your settings:

   ```env
   # Server Configuration
   PORT=80
   NODE_ENV=production

   # Vercel API Configuration
   VERCEL_API_URL=https://your-vercel-app.vercel.app/api/zkteco-data
   VERCEL_API_TIMEOUT=30000

   # Logging Configuration
   LOG_REQUESTS=true
   LOG_DEVICE_DATA=true

   # Server Information
   SERVER_NAME=ZKTeco-Bridge
   SERVER_VERSION=1.0.0
   ```

3. **Run the server:**

   ```bash
   npm start
   ```

   For development with auto-restart:

   ```bash
   npm run dev
   ```

## Configuration

### ZKTeco Device Setup

Configure your ZKTeco MB460 device ADMS settings:

1. **Access Device Menu**: Press `Menu` button
2. **Navigate to Communication**: Select `Comm.` → `OK`
3. **Configure Ethernet**: Set IP, Subnet, Gateway
4. **Enable ADMS**:
   - Set `ADMS` to `Enable`
   - Set `Server IP` to your server IP/domain
   - Set `Server Port` to `80`
   - Set `Enable Domain Name` to `Yes` (if using domain)

### ADMS Protocol Endpoints

The server implements the complete ZKTeco ADMS protocol:

- **`GET /iclock/getoptions`** - Device requests server configuration
- **`GET /iclock/gettime`** - Device requests server time for sync
- **`POST /iclock/setoptions`** - Device sends configuration to server
- **`POST /iclock/device`** - Device registration and time sync
- **`GET /iclock/ping`** - Device heartbeat/connectivity check
- **`POST /iclock/cdata`** - Main attendance data endpoint
- **`GET /iclock/info`** - Device requests server information
- **`GET /iclock/status`** - Device checks server status
- **`POST /iclock/command`** - Remote device commands
- **`GET /health`** - Health check with endpoint documentation

## Logging

The server provides comprehensive logging for all ADMS protocol interactions:

- **Request Details**: Timestamp, method, path, query parameters
- **Device Information**: IP address, headers, device serial number
- **Data Processing**: Content type, data type, table information
- **Forwarding Status**: Success/failure of Vercel API forwarding
- **Protocol Events**: Device registration, configuration, heartbeat

### Example Log Output

```
[2024-01-15T10:30:00.000Z] GET /iclock/getoptions
=== GETOPTIONS Request ===
Device requesting server options

[2024-01-15T10:30:05.000Z] POST /iclock/cdata
=== ZKTeco Attendance Data Received ===
Data Type: attlog, Device SN: ZK123456, Table: attlog
✅ Data successfully forwarded to Vercel API
```

## Environment Variables

The server uses environment variables for configuration. All settings can be configured in the `.env` file:

| Variable             | Default         | Description                    |
| -------------------- | --------------- | ------------------------------ |
| `PORT`               | `80`            | Server port                    |
| `NODE_ENV`           | `development`   | Environment mode               |
| `VERCEL_API_URL`     | Required        | Vercel API endpoint URL        |
| `VERCEL_API_TIMEOUT` | `30000`         | API timeout in milliseconds    |
| `DEVICE_TIMEOUT`     | `30000`         | Device timeout in milliseconds |
| `MAX_LOG_COUNT`      | `10000`         | Maximum log count              |
| `MAX_USER_COUNT`     | `1000`          | Maximum user count             |
| `LOG_REQUESTS`       | `true`          | Enable request logging         |
| `LOG_DEVICE_DATA`    | `true`          | Enable device data logging     |
| `SERVER_NAME`        | `ZKTeco-Bridge` | Server name                    |
| `SERVER_VERSION`     | `1.0.0`         | Server version                 |

## Requirements

- Node.js 18+ (for ES Modules support)
- Express.js
- node-fetch for API forwarding
- dotenv for environment configuration

## Security Note

This server runs on port 80 and accepts any text-based data. Make sure to:

- Run behind a firewall
- Monitor logs for suspicious activity
- Update the Vercel API URL with your actual endpoint

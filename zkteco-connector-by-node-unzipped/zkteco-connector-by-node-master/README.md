# ZKTeco JS
A Node.js application for managing and synchronizing ZKTeco fingerprint device data using Express.js and zklib-js library.
## Quick Start
```bash
# Install dependencies
npm install
# Configure your device IP in index.js
# Then run the application
node index.js
```
## Prerequisites
Before you can run this application, ensure you have the following installed on your system:
### Required Software
- **Node.js** (v20.0.0 or higher)
  - Download from: https://nodejs.org/
  - Verify installation: `node --version`
- **npm** (v10.0.0 or higher) - Package Manager
  - Comes bundled with Node.js
  - Verify installation: `npm --version`
### Hardware Requirements
- **ZKTeco Fingerprint Device**
  - Device must be on the same network as your machine
  - Device IP address must be known and accessible
  - Device must support ZKTeco communication protocol (TCP/IP)
### Network Requirements
- Ensure the ZKTeco device is connected to your network
- Verify network connectivity: `ping <DEVICE_IP>`
- Default device port: `4370` (can be configured in `index.js`)
## Installation Guide
### Step 1: Clone or Download the Repository
```bash
git clone <repository-url>
cd zkteco-js
```
Or download and extract the ZIP file.
### Step 2: Install Dependencies
```bash
npm install
```
This will install the following dependencies:
- **express** - Web framework
- **body-parser** - Middleware for parsing JSON
- **axios** - HTTP client
- **zklib-js** - ZKTeco device library
- **nodemon** - Development tool for auto-restarting
### Step 3: Configure Device Settings
Edit the `index.js` file and update the device configuration:
```javascript
const DEVICE_IP = "192.168.0.192";  // Change to your device IP
const PORT = 4370;                   // Change if your device uses a different port
```
Replace `192.168.0.192` with your actual ZKTeco device IP address.
### Step 4: Run the Application
#### Development Mode (with auto-restart):
```bash
npm run dev
```
#### Production Mode:
```bash
node index.js
```
Or on Windows:
```bash
run.bat
```
### Step 5: Verify Installation
Once the server starts, you should see output indicating:
- Express server is running
- Device connection status
- API endpoints are ready
Default server port: `3000` (or as configured in your application)
## Configuration
### Device IP and Port
Update these values in `index.js` according to your ZKTeco device settings:
```javascript
const DEVICE_IP = "192.168.0.192";  // Your ZKTeco device IP
const PORT = 4370;                   // Your ZKTeco device port
```
### Application Server Port
The Express server runs on port `3000` by default. To change it, modify the server configuration in `index.js`:
```javascript
const app = express();
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```
## Available Scripts
The following npm scripts are available:
```bash
npm run dev      # Run in development mode with auto-restart
npm start        # Run in production mode
npm test         # Run tests (if configured)
```
## Troubleshooting
### Cannot connect to device
1. **Verify the device IP address is correct**
   - Check your ZKTeco device's network settings
   - Confirm the IP matches the one in `index.js`
2. **Ensure the device is powered on and connected to the network**
   - Power cycle the device if necessary
   - Check network cable connection
3. **Check network connectivity**
   ```bash
   ping <DEVICE_IP>
   ```
4. **Verify the device port**
   - Default port is `4370`
   - Confirm this matches your device configuration
5. **Check firewall settings**
   - Ensure firewall isn't blocking port 4370
   - Allow the Node.js application through the firewall
### Module not found errors
1. Run `npm install` again to ensure all dependencies are properly installed
2. Delete `node_modules` folder and `package-lock.json`, then run `npm install` again
3. Check that you have the correct version of Node.js installed
### Application won't start
- **Port already in use**: Change the port in `index.js` to an available port
- **Node.js not in PATH**: Reinstall Node.js and restart your terminal
- **Missing dependencies**: Run `npm install` and verify all packages installed successfully
### Device communication errors
- Ensure the ZKTeco device is compatible with zklib-js
- Check that the device is not already connected from another application
- Restart the device and try again
- Review error messages in the console for specific issues
## Project Structure
```
zkteco-js/
├── index.js              # Main application file
├── package.json          # Project dependencies and metadata
├── package-lock.json     # npm dependency lock file
├── run.bat              # Windows batch file for running
├── run.vbs              # Windows VBS script
├── .gitignore           # Git ignore rules
└── README.md            # This file
```
## Project Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| express | ^5.2.1 | Web framework for REST API |
| body-parser | ^2.2.2 | Middleware for parsing JSON requests |
| axios | ^1.13.5 | HTTP client for external requests |
| zklib-js | ^1.3.5 | ZKTeco device communication library |
| nodemon | ^3.1.14 | Development tool for auto-restart |
## API Endpoints
The application provides REST API endpoints for interacting with the ZKTeco device. Check the `index.js` file for available endpoints.
## License
ISC
## Support
For issues and questions:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Review the zklib-js documentation
4. Check network and device configuration
---
**Last Updated:** February 28, 2026

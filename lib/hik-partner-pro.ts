import https from 'https';

export interface PartnerDevice {
  id: string;
  deviceName: string;
  deviceOnlineStatus: number;
  deviceSerial: string;
  deviceVersion?: string;
  deviceType?: string;
  siteID?: string;
  siteName?: string;
  totalChannels?: number;
}

export interface PartnerTokenData {
  accessToken: string;
  expireTime: number;
  areaDomain: string;
}

const HIK_PARTNER_APP_KEY = process.env.HIK_PARTNER_APP_KEY || 'uHJ4Jlj0Io';
const HIK_PARTNER_SECRET_KEY = process.env.HIK_PARTNER_SECRET_KEY || 'xVBqMjqwLc';
const GATEWAY_URL = 'https://isgp.hikcentralconnect.com';

let cachedToken: PartnerTokenData | null = null;
let tokenExpiresAt = 0;

function httpsPost(urlStr: string, data: any, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const payload = JSON.stringify(data);
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode || 500, body }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Hik-Partner Pro request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

// 1. Get Hik-Partner Pro Token
export async function getPartnerToken(): Promise<PartnerTokenData> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 300000) {
    return cachedToken;
  }

  const res = await httpsPost(`${GATEWAY_URL}/api/hpcgw/v1/token/get`, {
    appKey: HIK_PARTNER_APP_KEY,
    secretKey: HIK_PARTNER_SECRET_KEY,
  });

  if (res.status !== 200) {
    throw new Error(`Failed to get Hik-Partner Pro token, HTTP ${res.status}: ${res.body}`);
  }

  const parsed = JSON.parse(res.body);
  if (parsed.errorCode !== '0' || !parsed.data?.accessToken) {
    throw new Error(`Hik-Partner Pro token error: ${parsed.message || res.body}`);
  }

  cachedToken = {
    accessToken: parsed.data.accessToken,
    expireTime: parsed.data.expireTime || now + 86400000,
    areaDomain: parsed.data.areaDomain || 'https://apiisgp.hik-partner.com',
  };
  tokenExpiresAt = cachedToken.expireTime;

  return cachedToken;
}

// 2. Fetch Devices List (Sites & DVRs)
export async function getPartnerDevices(): Promise<PartnerDevice[]> {
  const tokenData = await getPartnerToken();

  const res = await httpsPost(
    `${tokenData.areaDomain}/api/hpcgw/v1/device/list`,
    { pageIndex: 1, pageSize: 50 },
    { Authorization: `Bearer ${tokenData.accessToken}` }
  );

  const parsed = JSON.parse(res.body);
  if (parsed.errorCode !== '0') {
    throw new Error(`Failed to get devices: ${parsed.message || res.body}`);
  }

  const rows = parsed.data?.rows || [];
  return rows.map((r: any) => ({
    id: r.id,
    deviceName: r.deviceName || r.deviceSerial,
    deviceOnlineStatus: r.deviceOnlineStatus,
    deviceSerial: r.deviceSerial,
    deviceVersion: r.deviceVersion,
    deviceType: r.deviceType,
    siteID: r.siteID,
    siteName: r.siteName,
    totalChannels: r.deviceType?.includes('7204') ? 4 : (r.deviceType?.includes('7208') ? 8 : 16),
  }));
}

// 3. Get Live Stream Address & Ticket
export async function getPartnerLiveAddress(
  deviceSerial: string,
  channelNo: number = 1,
  quality: 'live' | 'hd' = 'live'
): Promise<{ url: string; ticket: string; deviceSerial: string; channelNo: number }> {
  const tokenData = await getPartnerToken();

  // quality: 1 = HD (2K), 2 = Sub (Smooth)
  const qNum = quality === 'hd' ? 1 : 2;

  const res = await httpsPost(
    `${tokenData.areaDomain}/api/hpcgw/v1/device/live/address/get`,
    {
      deviceSerial,
      channelNo,
      quality: qNum,
    },
    { Authorization: `Bearer ${tokenData.accessToken}` }
  );

  const parsed = JSON.parse(res.body);
  if (parsed.errorCode !== '0' || !parsed.data?.ticket) {
    throw new Error(`Failed to get live address: ${parsed.message || res.body}`);
  }

  return {
    url: parsed.data.url,
    ticket: parsed.data.ticket,
    deviceSerial,
    channelNo,
  };
}

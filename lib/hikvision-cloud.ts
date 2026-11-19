import https from 'https';

export interface CloudCamera {
  id: string;
  name: string;
  channelNo: number;
  online: boolean;
  serialNo: string;
}

export interface CloudTokenData {
  accessToken: string;
  expireTime: number;
  areaDomain: string;
}

const HIK_APP_KEY = process.env.HIK_APP_KEY || 'oPja8tT9RKlkK1yivP6DBJy7rnRNn8bF';
const HIK_SECRET_KEY = process.env.HIK_SECRET_KEY || 'k2tdY1qAAQnMgnKXcCQ2NVYRVa1UNQz0';
const DEFAULT_AREA_DOMAIN = process.env.HIK_AREA_DOMAIN || 'https://isgp.hikcentralconnect.com';

let cachedToken: CloudTokenData | null = null;
let tokenExpiresAt = 0;

function httpsPost(urlStr: string, data: any, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const payload = JSON.stringify(data);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname,
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
      reject(new Error('HikCentral Connect timeout'));
    });
    req.write(payload);
    req.end();
  });
}

function httpsGetBuffer(urlStr: string): Promise<{ status: number; contentType?: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    https.get(urlStr, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.from(c)));
      res.on('end', () =>
        resolve({
          status: res.statusCode || 500,
          contentType: res.headers['content-type'],
          body: Buffer.concat(chunks),
        })
      );
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function getCloudToken(): Promise<CloudTokenData> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 300) {
    return cachedToken;
  }

  const res = await httpsPost(`${DEFAULT_AREA_DOMAIN}/api/hccgw/platform/v1/token/get`, {
    appKey: HIK_APP_KEY,
    secretKey: HIK_SECRET_KEY,
  });

  if (res.status !== 200) {
    throw new Error(`Failed to get cloud token, HTTP ${res.status}: ${res.body}`);
  }

  const parsed = JSON.parse(res.body);
  if (parsed.errorCode !== '0' || !parsed.data?.accessToken) {
    throw new Error(`HikCentral Connect token error: ${parsed.message || res.body}`);
  }

  cachedToken = {
    accessToken: parsed.data.accessToken,
    expireTime: parsed.data.expireTime,
    areaDomain: parsed.data.areaDomain || DEFAULT_AREA_DOMAIN,
  };
  tokenExpiresAt = parsed.data.expireTime || now + 86400;

  return cachedToken;
}

export async function getCloudCameras(): Promise<{ cameras: CloudCamera[]; deviceOnline: boolean; deviceSerial: string }> {
  const tokenData = await getCloudToken();

  // 1. Get devices to find areaId and device info
  const devRes = await httpsPost(
    `${tokenData.areaDomain}/api/hccgw/resource/v1/devices/get`,
    { pageIndex: 1, pageSize: 50 },
    { Token: tokenData.accessToken }
  );

  const devParsed = JSON.parse(devRes.body);
  const devices = devParsed.data?.device || [];
  const primaryDev = devices[0];
  const deviceOnline = primaryDev?.onlineStatus === 1;
  const deviceSerial = primaryDev?.serialNo || 'GK0622137';
  const areaId = primaryDev?.areaId || 'b01f48fdf92948fb946586277a4ae8b5_r';

  // 2. Get cameras for this area
  const camRes = await httpsPost(
    `${tokenData.areaDomain}/api/hccgw/resource/v1/areas/cameras/get`,
    {
      pageIndex: 1,
      pageSize: 50,
      includeSubArea: true,
      filter: { areaId },
    },
    { Token: tokenData.accessToken }
  );

  const camParsed = JSON.parse(camRes.body);
  const rawCameras = camParsed.data?.camera || [];

  const cameras: CloudCamera[] = rawCameras.map((c: any) => ({
    id: c.id,
    name: c.name || `الكاميرا ${c.device?.channelInfo?.no}`,
    channelNo: parseInt(c.device?.channelInfo?.no || '1', 10),
    online: c.online === '1',
    serialNo: c.device?.devInfo?.serialNo || deviceSerial,
  })).sort((a: CloudCamera, b: CloudCamera) => a.channelNo - b.channelNo);

  return { cameras, deviceOnline, deviceSerial };
}

// Cache thumbnail URLs briefly to prevent spamming the gateway
const thumbnailCache: Record<string, { url: string; expiresAt: number }> = {};
// Store last known image buffer per camera so that if capture is in progress, the UI never breaks
const lastKnownImageBuffer: Record<string, Buffer> = {};
interface StreamTokenData {
  appKey: string;
  appToken: string;
  streamAreaDomain: string;
  expireTime: number;
}

let cachedStreamToken: StreamTokenData | null = null;
let streamTokenExpiresAt = 0;

export async function getCloudStreamToken(): Promise<StreamTokenData> {
  const now = Date.now();
  if (cachedStreamToken && streamTokenExpiresAt > now + 300000) {
    return cachedStreamToken;
  }

  const tokenData = await getCloudToken();
  const res = await httpsGet(
    `${tokenData.areaDomain}/api/hccgw/platform/v1/streamtoken/get`,
    { Token: tokenData.accessToken }
  );

  const parsed = JSON.parse(res.body);
  if (parsed.errorCode !== '0' || !parsed.data?.appToken) {
    throw new Error(`Failed to get player stream token: ${parsed.message || res.body}`);
  }

  cachedStreamToken = {
    appKey: parsed.data.appKey,
    appToken: parsed.data.appToken,
    streamAreaDomain: parsed.data.streamAreaDomain || 'https://isgpopen.ezvizlife.com',
    expireTime: parseInt(parsed.data.expireTime || '0', 10),
  };
  streamTokenExpiresAt = cachedStreamToken.expireTime || now + 86400000;

  return cachedStreamToken;
}

function httpsGet(urlStr: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'GET',
        headers: headers,
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
      reject(new Error('HTTP GET timeout'));
    });
    req.end();
  });
}

function httpsPostForm(urlStr: string, formString: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formString),
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
      reject(new Error('HTTP POST form timeout'));
    });
    req.write(formString);
    req.end();
  });
}

export async function getCloudHlsStreamUrl(
  channelNo: number,
  deviceSerial = 'GK0622137',
  quality: 'hd' | 'sub' = 'sub'
) {
  const streamToken = await getCloudStreamToken();
  const url = `${streamToken.streamAreaDomain}/api/lapp/v2/live/address/get`;

  const payload = new URLSearchParams({
    accessToken: streamToken.appToken,
    deviceSerial,
    channelNo: channelNo.toString(),
    protocol: '2', // HLS protocol
    quality: quality === 'hd' ? '1' : '2',
  }).toString();

  const res = await httpsPostForm(url, payload);
  const parsed = JSON.parse(res.body);
  if (parsed.code === '200' && parsed.data?.url) {
    return {
      hlsUrl: parsed.data.url,
      expireTime: parsed.data.expireTime,
      channel: channelNo,
      deviceSerial,
    };
  }

  throw new Error(`Failed to get HLS stream address: ${parsed.msg || res.body}`);
}

const lastCaptureTime: Record<string, number> = {};

export async function getCloudCameraSnapshot(cameraId: string, forceRefresh = false): Promise<Buffer> {
  const tokenData = await getCloudToken();
  const now = Date.now();

  const timeSinceLastCapture = now - (lastCaptureTime[cameraId] || 0);
  // Auto-refresh fresh image if requested or if last capture is older than 3 seconds
  const shouldCaptureFresh = forceRefresh || timeSinceLastCapture > 3000;

  let pictureUrl = '';
  if (!shouldCaptureFresh && thumbnailCache[cameraId] && thumbnailCache[cameraId].expiresAt > now) {
    pictureUrl = thumbnailCache[cameraId].url;
  } else {
    // Only send refresh: 1 if at least 2.5s have elapsed since previous hardware capture on this channel
    const canSendCaptureCommand = timeSinceLastCapture > 2500;
    const refreshMode = canSendCaptureCommand ? 1 : 0;
    if (canSendCaptureCommand) {
      lastCaptureTime[cameraId] = now;
    }

    let thumbRes = await httpsPost(
      `${tokenData.areaDomain}/api/hccgw/resource/v1/areas/cameras/thumbnail/get`,
      {
        cameraID: cameraId,
        refresh: refreshMode,
      },
      { Token: tokenData.accessToken }
    );

    let parsed = JSON.parse(thumbRes.body);
    pictureUrl = parsed.data?.pictureURL;

    // If refresh: 1 was throttled (CCF021516), fallback gracefully to refresh: 0
    if (!pictureUrl && refreshMode === 1) {
      console.warn(`Hardware capture busy for ${cameraId}, falling back to current cloud frame`);
      const fallbackRes = await httpsPost(
        `${tokenData.areaDomain}/api/hccgw/resource/v1/areas/cameras/thumbnail/get`,
        {
          cameraID: cameraId,
          refresh: 0,
        },
        { Token: tokenData.accessToken }
      );
      const fallbackParsed = JSON.parse(fallbackRes.body);
      pictureUrl = fallbackParsed.data?.pictureURL;
    }

    if (!pictureUrl) {
      if (lastKnownImageBuffer[cameraId]) {
        return lastKnownImageBuffer[cameraId];
      }
      throw new Error(`Failed to get thumbnail URL: ${parsed.message || thumbRes.body}`);
    }

    thumbnailCache[cameraId] = {
      url: pictureUrl,
      expiresAt: now + 2500,
    };
  }

  try {
    const imgRes = await httpsGetBuffer(pictureUrl);
    if (imgRes.status === 200 && imgRes.body.length > 0) {
      lastKnownImageBuffer[cameraId] = imgRes.body;
      return imgRes.body;
    }
  } catch (err) {
    if (lastKnownImageBuffer[cameraId]) {
      return lastKnownImageBuffer[cameraId];
    }
    throw err;
  }

  if (lastKnownImageBuffer[cameraId]) {
    return lastKnownImageBuffer[cameraId];
  }

  throw new Error(`Failed to download camera image from ${pictureUrl}`);
}

export async function getCloudLiveStreamUrl(
  cameraId: string,
  deviceSerial = 'GK0622137',
  code = 'Y1KkbT',
  protocolType = '1'
) {
  const tokenData = await getCloudToken();
  const streamTokenData = await getCloudStreamToken();

  const streamRes = await httpsPost(
    `${tokenData.areaDomain}/api/hccgw/video/v1/live/address/get`,
    {
      resourceId: cameraId,
      deviceSerial,
      type: protocolType,
      code,
    },
    { Token: tokenData.accessToken }
  );

  const parsed = JSON.parse(streamRes.body);
  console.log(`Live stream response (type ${protocolType}):`, parsed);
  if (parsed.errorCode === '0' && parsed.data?.url) {
    return {
      url: parsed.data.url,
      accessToken: streamTokenData.appToken, // 'at...' player token accepted by EZUIKit
      streamAreaDomain: streamTokenData.streamAreaDomain,
      type: protocolType,
    };
  }

  // If type wasn't '1' (ezopen) and failed, try ezopen '1' as fallback
  if (protocolType !== '1') {
    const fallbackRes = await httpsPost(
      `${tokenData.areaDomain}/api/hccgw/video/v1/live/address/get`,
      {
        resourceId: cameraId,
        deviceSerial,
        type: '1',
        code,
      },
      { Token: tokenData.accessToken }
    );
    const fallbackParsed = JSON.parse(fallbackRes.body);
    if (fallbackParsed.errorCode === '0' && fallbackParsed.data?.url) {
      return {
        url: fallbackParsed.data.url,
        accessToken: streamTokenData.appToken,
        streamAreaDomain: streamTokenData.streamAreaDomain,
        type: '1',
      };
    }
  }

  throw new Error(`Failed to get live stream URL: ${parsed.message || streamRes.body}`);
}

export async function getCloudWsStreamUrl(
  channelNo: number,
  deviceSerial = 'GK0622137',
  quality: 'live' | 'hd' = 'live'
) {
  const streamToken = await getCloudStreamToken();
  const qStr = quality === 'hd' ? 'hd.live' : 'live';
  const ezopenUrl = `ezopen://open.ezviz.com/${deviceSerial}/${channelNo}.${qStr}`;

  const fd = new FormData();
  fd.append('ezopen', ezopenUrl);
  fd.append('isFlv', 'false');
  fd.append('userAgent', 'Mozilla/5.0');
  fd.append('isHttp', 'false');
  fd.append('accessToken', streamToken.appToken);

  const res = await fetch(`${streamToken.streamAreaDomain}/api/lapp/live/url/ezopen`, {
    method: 'POST',
    body: fd,
  });

  const parsed = await res.json();
  if (parsed.code === '200' && parsed.data?.url) {
    const wsUrl = `${parsed.data.url}&ssn=${parsed.data.token}&auth=1&biz=4&cln=100&checkCode=Y1KkbT`;
    return {
      wsUrl,
      ezopenUrl,
      accessToken: streamToken.appToken,
      streamAreaDomain: streamToken.streamAreaDomain,
      token: parsed.data.token,
    };
  }

  throw new Error(`Failed to get WebSocket stream: ${parsed.msg || JSON.stringify(parsed)}`);
}

export interface CloudAlarmItem {
  alarmId: string;
  alarmName: string;
  alarmType: number | string;
  alarmTime: number;
  channelNo: number;
  deviceSerial: string;
  isCheck: number;
  isEncrypt: number;
  preTime: number;
  delayTime: number;
  picUrl?: string;
  videoUrl?: string;
  targetType?: 'human' | 'vehicle' | 'motion' | 'other';
}

export async function getCloudDefenceStatus(deviceSerial = 'GK0622137'): Promise<{ isDefence: boolean; defence: number }> {
  const streamToken = await getCloudStreamToken();
  const res = await fetch(`${streamToken.streamAreaDomain}/api/lapp/device/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `accessToken=${encodeURIComponent(streamToken.appToken)}&deviceSerial=${encodeURIComponent(deviceSerial)}`,
  });

  const parsed = await res.json();
  if (parsed.code === '200' && parsed.data) {
    return {
      isDefence: parsed.data.defence === 1,
      defence: parsed.data.defence,
    };
  }
  throw new Error(`Failed to get defence status: ${parsed.msg || JSON.stringify(parsed)}`);
}

export async function setCloudDefence(isDefence: boolean, deviceSerial = 'GK0622137'): Promise<boolean> {
  const streamToken = await getCloudStreamToken();
  const val = isDefence ? 1 : 0;
  const res = await fetch(`${streamToken.streamAreaDomain}/api/lapp/device/defence/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `accessToken=${encodeURIComponent(streamToken.appToken)}&deviceSerial=${encodeURIComponent(deviceSerial)}&isDefence=${val}`,
  });

  const parsed = await res.json();
  if (parsed.code === '200') {
    return true;
  }
  throw new Error(`Failed to set defence mode: ${parsed.msg || JSON.stringify(parsed)}`);
}

export async function getCloudAlarms(
  channelNo?: number,
  startTime?: number,
  endTime?: number,
  pageSize = 50,
  pageStart = 0,
  deviceSerial = 'GK0622137'
): Promise<{ total: number; alarms: CloudAlarmItem[] }> {
  const streamToken = await getCloudStreamToken();
  const params: string[] = [
    `accessToken=${encodeURIComponent(streamToken.appToken)}`,
    `deviceSerial=${encodeURIComponent(deviceSerial)}`,
    `pageSize=${pageSize}`,
    `pageStart=${pageStart}`,
  ];

  if (channelNo) {
    params.push(`channelNo=${channelNo}`);
  }
  if (startTime) {
    params.push(`startTime=${startTime}`);
  }
  if (endTime) {
    params.push(`endTime=${endTime}`);
  }

  const res = await fetch(`${streamToken.streamAreaDomain}/api/lapp/alarm/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.join('&'),
  });

  const parsed = await res.json();
  if (parsed.code === '200') {
    const rawList = parsed.data || [];
    const alarms: CloudAlarmItem[] = rawList.map((item: any) => {
      // Analyze alarm type to classify target
      let targetType: 'human' | 'vehicle' | 'motion' | 'other' = 'other';
      const name = (item.alarmName || '').toLowerCase();
      const typeStr = String(item.alarmType || '');

      if (name.includes('human') || name.includes('person') || name.includes('إنسان') || name.includes('شخص') || typeStr === '10000') {
        targetType = 'human';
      } else if (name.includes('vehicle') || name.includes('car') || name.includes('مركبة') || name.includes('سيارة')) {
        targetType = 'vehicle';
      } else if (name.includes('motion') || name.includes('حركة')) {
        targetType = 'motion';
      }

      return {
        alarmId: item.alarmId,
        alarmName: item.alarmName || 'كشف حركة ذكي',
        alarmType: item.alarmType,
        alarmTime: item.alarmTime,
        channelNo: item.channelNo,
        deviceSerial: item.deviceSerial || deviceSerial,
        isCheck: item.isCheck || 0,
        isEncrypt: item.isEncrypt || 0,
        preTime: item.preTime || 0,
        delayTime: item.delayTime || 0,
        picUrl: item.alarmPicUrl || item.picUrl,
        videoUrl: item.videoUrl,
        targetType,
      };
    });

    return {
      total: parsed.page?.total || alarms.length,
      alarms,
    };
  }

  throw new Error(`Failed to fetch cloud alarms: ${parsed.msg || JSON.stringify(parsed)}`);
}


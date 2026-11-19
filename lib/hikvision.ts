import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface CameraConfig {
  ip: string;
  port: number;
  user: string;
  pass: string;
  totalChannels: number;
}

export interface CameraChannelInfo {
  channel: number;
  id: string;
  name: string;
  mainStreamId: number;
  subStreamId: number;
  enabled: boolean;
}

export interface RecordedClip {
  trackId: number;
  channel: number;
  startTime: string;
  endTime: string;
  size: number;
  sizeFormatted: string;
  playbackURI: string;
}

const DEFAULT_CONFIG: CameraConfig = {
  ip: process.env.HIKVISION_IP || '192.168.8.243',
  port: Number(process.env.HIKVISION_PORT) || 80,
  user: process.env.HIKVISION_USER || 'admin',
  pass: process.env.HIKVISION_PASSWORD || 'ALam@1245',
  totalChannels: 16,
};

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'data', 'cameras_config.json');

export interface CameraSettingsStorage {
  customNames: Record<number, string>;
  refreshInterval: number; // in seconds
  defaultStream: 'sub' | 'main';
}

export function getCameraCustomSettings(): CameraSettingsStorage {
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const raw = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to read cameras_config.json', e);
  }
  return {
    customNames: {},
    refreshInterval: 2,
    defaultStream: 'sub',
  };
}

export function saveCameraCustomSettings(settings: Partial<CameraSettingsStorage>) {
  try {
    const current = getCameraCustomSettings();
    const updated = { ...current, ...settings };
    const dir = path.dirname(SETTINGS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (e) {
    console.error('Failed to save cameras_config.json', e);
    throw e;
  }
}

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

function parseDigestHeader(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  const cleanHeader = header.replace(/^Digest\s+/i, '');
  const matches = cleanHeader.match(/([a-zA-Z0-9_-]+)="?([^",]+)"?/g) || [];
  matches.forEach((m) => {
    const eqIdx = m.indexOf('=');
    const key = m.slice(0, eqIdx).trim();
    let val = m.slice(eqIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    params[key] = val;
  });
  return params;
}

let lastDigestParams: { realm: string; nonce: string; qop?: string } | null = null;
let ncCounter = 0;

export function fetchHikvision(
  urlPath: string,
  method = 'GET',
  config: CameraConfig = DEFAULT_CONFIG,
  postBody?: string,
  contentType?: string
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const makeRequest = (authHeader?: string, retryOnAuth = true) => {
      const headers: Record<string, string> = {};
      if (authHeader) headers['Authorization'] = authHeader;
      if (contentType) headers['Content-Type'] = contentType;
      if (postBody) headers['Content-Length'] = String(Buffer.byteLength(postBody));

      const req = http.request(
        {
          hostname: config.ip,
          port: config.port,
          path: urlPath,
          method: method,
          timeout: 10000,
          headers,
        },
        (res) => {
          if (res.statusCode === 401 && retryOnAuth && res.headers['www-authenticate']) {
            const rawAuth = res.headers['www-authenticate'] as string;
            const digest = parseDigestHeader(rawAuth);
            lastDigestParams = { realm: digest.realm, nonce: digest.nonce, qop: digest.qop };
            ncCounter = 1;

            const uri = urlPath;
            const ha1 = md5(`${config.user}:${digest.realm}:${config.pass}`);
            const ha2 = md5(`${method}:${uri}`);
            const nc = String(ncCounter).padStart(8, '0');
            const cnonce = crypto.randomBytes(8).toString('hex');

            let response: string;
            let authVal: string;
            if (digest.qop) {
              response = md5(`${ha1}:${digest.nonce}:${nc}:${cnonce}:${digest.qop}:${ha2}`);
              authVal = `Digest username="${config.user}", realm="${digest.realm}", nonce="${digest.nonce}", uri="${uri}", qop=${digest.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
            } else {
              response = md5(`${ha1}:${digest.nonce}:${ha2}`);
              authVal = `Digest username="${config.user}", realm="${digest.realm}", nonce="${digest.nonce}", uri="${uri}", response="${response}"`;
            }

            makeRequest(authVal, false);
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            resolve({
              status: res.statusCode || 500,
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
        }
      );

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy(new Error('Connection timeout to DVR'));
      });

      if (postBody) {
        req.write(postBody);
      }
      req.end();
    };

    if (lastDigestParams) {
      ncCounter++;
      const uri = urlPath;
      const ha1 = md5(`${config.user}:${lastDigestParams.realm}:${config.pass}`);
      const ha2 = md5(`${method}:${uri}`);
      const nc = String(ncCounter).padStart(8, '0');
      const cnonce = crypto.randomBytes(8).toString('hex');
      let response: string;
      let authVal: string;
      if (lastDigestParams.qop) {
        response = md5(`${ha1}:${lastDigestParams.nonce}:${nc}:${cnonce}:${lastDigestParams.qop}:${ha2}`);
        authVal = `Digest username="${config.user}", realm="${lastDigestParams.realm}", nonce="${lastDigestParams.nonce}", uri="${uri}", qop=${lastDigestParams.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
      } else {
        response = md5(`${ha1}:${lastDigestParams.nonce}:${ha2}`);
        authVal = `Digest username="${config.user}", realm="${lastDigestParams.realm}", nonce="${lastDigestParams.nonce}", uri="${uri}", response="${response}"`;
      }
      makeRequest(authVal, true);
    } else {
      makeRequest(undefined, true);
    }
  });
}

export async function getCameraSnapshot(channelNum: number, stream: 'main' | 'sub' = 'sub'): Promise<Buffer> {
  const channelId = channelNum * 100 + (stream === 'main' ? 1 : 2);
  const urlPath = `/ISAPI/Streaming/channels/${channelId}/picture`;
  const res = await fetchHikvision(urlPath, 'GET');
  if (res.status === 200 && res.body.length > 0) {
    return res.body;
  }
  throw new Error(`Failed to capture snapshot for channel ${channelNum} (ID: ${channelId}), HTTP Status: ${res.status}`);
}

export async function getDeviceInfo() {
  try {
    const res = await fetchHikvision('/ISAPI/System/deviceInfo');
    if (res.status === 200) {
      const xml = res.body.toString('utf-8');
      const getTag = (tag: string) => {
        const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
        return m ? m[1].trim() : '';
      };
      return {
        online: true,
        deviceName: getTag('deviceName') || 'Hikvision DVR',
        model: getTag('model') || 'iDS-7216HUHI-M2/XT',
        serialNumber: getTag('serialNumber'),
        firmwareVersion: getTag('firmwareVersion'),
        totalChannels: DEFAULT_CONFIG.totalChannels,
      };
    }
  } catch (e: any) {
    return {
      online: false,
      error: e.message,
      model: 'iDS-7216HUHI-M2/XT',
      totalChannels: DEFAULT_CONFIG.totalChannels,
    };
  }
  return {
    online: false,
    model: 'iDS-7216HUHI-M2/XT',
    totalChannels: DEFAULT_CONFIG.totalChannels,
  };
}

export async function searchRecordedClips(channel: number, dateStr: string): Promise<RecordedClip[]> {
  const trackId = channel * 100 + 1;
  const startTime = `${dateStr}T00:00:00Z`;
  const endTime = `${dateStr}T23:59:59Z`;

  const searchXml = `<?xml version="1.0" encoding="utf-8"?>
<CMSearchDescription>
<searchID>{c0000000-0000-0000-0000-000000000001}</searchID>
<trackList>
<trackID>${trackId}</trackID>
</trackList>
<timeSpanList>
<timeSpan>
<startTime>${startTime}</startTime>
<endTime>${endTime}</endTime>
</timeSpan>
</timeSpanList>
<maxResults>50</maxResults>
<searchResultPosition>0</searchResultPosition>
<metadataDescriptor>//recordType.meta.hikvision.com/All</metadataDescriptor>
</CMSearchDescription>`;

  const res = await fetchHikvision(
    '/ISAPI/ContentMgmt/search',
    'POST',
    DEFAULT_CONFIG,
    searchXml,
    'application/xml'
  );

  if (res.status !== 200) {
    throw new Error(`Failed to search recordings, HTTP status: ${res.status}`);
  }

  const xml = res.body.toString('utf-8');
  const clips: RecordedClip[] = [];

  const itemMatches = xml.match(/<searchMatchItem>([\s\S]*?)<\/searchMatchItem>/g) || [];
  for (const item of itemMatches) {
    const getVal = (tag: string) => {
      const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`));
      return m ? m[1].trim() : '';
    };

    const sTime = getVal('startTime');
    const eTime = getVal('endTime');
    const uri = getVal('playbackURI').replace(/&amp;/g, '&');

    let size = 0;
    const sizeMatch = uri.match(/size=(\d+)/);
    if (sizeMatch) {
      size = parseInt(sizeMatch[1], 10);
    }

    const formatSize = (bytes: number) => {
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    clips.push({
      trackId,
      channel,
      startTime: sTime,
      endTime: eTime,
      size,
      sizeFormatted: formatSize(size),
      playbackURI: uri,
    });
  }

  return clips;
}

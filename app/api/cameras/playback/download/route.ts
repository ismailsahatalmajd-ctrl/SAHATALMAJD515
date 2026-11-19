import { NextRequest, NextResponse } from 'next/server';
import http from 'http';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const playbackURI = searchParams.get('playbackURI');
  const channel = searchParams.get('channel') || '1';
  const time = searchParams.get('time') || Date.now().toString();

  if (!playbackURI) {
    return NextResponse.json({ error: 'playbackURI is required' }, { status: 400 });
  }

  const ip = process.env.HIKVISION_IP || '192.168.8.243';
  const port = Number(process.env.HIKVISION_PORT) || 80;
  const user = process.env.HIKVISION_USER || 'admin';
  const pass = process.env.HIKVISION_PASSWORD || 'ALam@1245';

  const downloadXml = `<?xml version="1.0" encoding="utf-8"?>
<downloadRequest>
<playbackURI>${playbackURI.replace(/&/g, '&amp;')}</playbackURI>
</downloadRequest>`;

  const cleanTime = time.replace(/[:.]/g, '-');
  const filename = `camera_${channel}_recording_${cleanTime}.mp4`;

  return new Promise<NextResponse>((resolve) => {
    const urlPath = '/ISAPI/ContentMgmt/download';
    const method = 'POST';

    const sendRequest = (authHeader?: string, retry = true) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/xml',
        'Content-Length': String(Buffer.byteLength(downloadXml)),
      };
      if (authHeader) headers['Authorization'] = authHeader;

      const proxyReq = http.request(
        {
          hostname: ip,
          port,
          path: urlPath,
          method,
          headers,
          timeout: 60000,
        },
        (proxyRes) => {
          if (proxyRes.statusCode === 401 && retry && proxyRes.headers['www-authenticate']) {
            const rawAuth = proxyRes.headers['www-authenticate'] as string;
            const digest = parseDigestHeader(rawAuth);
            const uri = urlPath;
            const ha1 = md5(`${user}:${digest.realm}:${pass}`);
            const ha2 = md5(`${method}:${uri}`);
            const nc = '00000001';
            const cnonce = crypto.randomBytes(8).toString('hex');

            let response: string;
            let authVal: string;
            if (digest.qop) {
              response = md5(`${ha1}:${digest.nonce}:${nc}:${cnonce}:${digest.qop}:${ha2}`);
              authVal = `Digest username="${user}", realm="${digest.realm}", nonce="${digest.nonce}", uri="${uri}", qop=${digest.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
            } else {
              response = md5(`${ha1}:${digest.nonce}:${ha2}`);
              authVal = `Digest username="${user}", realm="${digest.realm}", nonce="${digest.nonce}", uri="${uri}", response="${response}"`;
            }

            sendRequest(authVal, false);
            return;
          }

          if (proxyRes.statusCode !== 200) {
            resolve(
              NextResponse.json(
                { error: `Download failed with HTTP status: ${proxyRes.statusCode}` },
                { status: proxyRes.statusCode || 500 }
              )
            );
            return;
          }

          // Create a web stream from Node.js readable stream
          const stream = new ReadableStream({
            start(controller) {
              proxyRes.on('data', (chunk) => controller.enqueue(chunk));
              proxyRes.on('end', () => controller.close());
              proxyRes.on('error', (err) => controller.error(err));
            },
            cancel() {
              proxyRes.destroy();
            },
          });

          resolve(
            new NextResponse(stream, {
              status: 200,
              headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="${filename}"`,
                ...(proxyRes.headers['content-length']
                  ? { 'Content-Length': proxyRes.headers['content-length'] }
                  : {}),
              },
            })
          );
        }
      );

      proxyReq.on('error', (err) => {
        resolve(NextResponse.json({ error: err.message }, { status: 500 }));
      });

      proxyReq.write(downloadXml);
      proxyReq.end();
    };

    sendRequest(undefined, true);
  });
}

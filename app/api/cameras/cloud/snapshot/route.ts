import { NextRequest, NextResponse } from 'next/server';
import { getCloudCameraSnapshot, getCloudCameras } from '@/lib/hikvision-cloud';

export const dynamic = 'force-dynamic';

function generatePlaceholderSvg(title: string, errorMsg: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" fill="#18181b">
    <rect width="640" height="360" fill="#18181b"/>
    <rect x="20" y="20" width="600" height="320" rx="8" fill="#09090b" stroke="#27272a" stroke-width="2"/>
    <circle cx="320" cy="150" r="36" fill="#27272a" />
    <path d="M305 150 L335 150 M320 135 L320 165" stroke="#71717a" stroke-width="3" stroke-linecap="round"/>
    <text x="320" y="220" text-anchor="middle" fill="#e4e4e7" font-family="system-ui, sans-serif" font-size="20" font-weight="bold">
      ${title}
    </text>
    <text x="320" y="250" text-anchor="middle" fill="#71717a" font-family="system-ui, sans-serif" font-size="14">
      ${errorMsg || 'جاري الاتصال عبر سحابة Hik-Connect...'}
    </text>
  </svg>`;
  return Buffer.from(svg);
}

let channelToIdMap: Record<number, string> = {};
let mapExpiresAt = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let cameraId = searchParams.get('cameraId');
  const channelStr = searchParams.get('channel');

  try {
    if (!cameraId && channelStr) {
      const channel = parseInt(channelStr, 10);
      const now = Date.now();
      if (!channelToIdMap[channel] || mapExpiresAt < now) {
        const { cameras } = await getCloudCameras();
        channelToIdMap = {};
        cameras.forEach((c) => {
          channelToIdMap[c.channelNo] = c.id;
        });
        mapExpiresAt = now + 5 * 60 * 1000;
      }
      cameraId = channelToIdMap[channel];
    }

    if (!cameraId) {
      return new NextResponse(
        new Uint8Array(generatePlaceholderSvg('الكاميرا غير معرفة', 'لم يتم العثور على معرّف الكاميرا السحابي')),
        {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml' },
        }
      );
    }

    const forceRefresh = searchParams.get('refresh') === '1' || searchParams.get('force') === '1';
    const imageBuffer = await getCloudCameraSnapshot(cameraId, forceRefresh);

    return new NextResponse(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    console.error('Cloud snapshot error:', error?.message || error);
    const svgBuffer = generatePlaceholderSvg(
      `الكاميرا ${channelStr || ''}`,
      error?.message || 'تعذر جلب البث السحابي'
    );
    return new NextResponse(new Uint8Array(svgBuffer), {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  }
}

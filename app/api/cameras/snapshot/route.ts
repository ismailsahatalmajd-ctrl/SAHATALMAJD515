import { NextRequest, NextResponse } from 'next/server';
import { getCameraSnapshot } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';

function generatePlaceholderSvg(channel: number, errorMsg: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" fill="#18181b">
    <rect width="640" height="360" fill="#18181b"/>
    <rect x="20" y="20" width="600" height="320" rx="8" fill="#09090b" stroke="#27272a" stroke-width="2"/>
    <circle cx="320" cy="150" r="36" fill="#27272a" />
    <path d="M305 150 L335 150 M320 135 L320 165" stroke="#71717a" stroke-width="3" stroke-linecap="round"/>
    <text x="320" y="220" text-anchor="middle" fill="#e4e4e7" font-family="system-ui, sans-serif" font-size="20" font-weight="bold">
      الكاميرا ${channel} - غير متصلة
    </text>
    <text x="320" y="250" text-anchor="middle" fill="#71717a" font-family="system-ui, sans-serif" font-size="14">
      ${errorMsg || 'جاري محاولة إعادة الاتصال بالـ DVR...'}
    </text>
  </svg>`;
  return Buffer.from(svg);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channel = parseInt(searchParams.get('channel') || '1', 10);
  const stream = (searchParams.get('stream') === 'main' ? 'main' : 'sub') as 'main' | 'sub';

  if (isNaN(channel) || channel < 1 || channel > 32) {
    return NextResponse.json({ error: 'رقم الكاميرا غير صحيح' }, { status: 400 });
  }

  try {
    const imageBuffer = await getCameraSnapshot(channel, stream);

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
    console.error(`Camera ${channel} snapshot error:`, error?.message || error);
    const svgBuffer = generatePlaceholderSvg(channel, error?.message || 'انقطاع الاتصال');
    return new NextResponse(new Uint8Array(svgBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      },
    });
  }
}

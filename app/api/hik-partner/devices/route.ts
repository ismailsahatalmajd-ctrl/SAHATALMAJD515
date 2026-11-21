import { NextResponse } from 'next/server';
import { getPartnerDevices } from '@/lib/hik-partner-pro';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const devices = await getPartnerDevices();
    return NextResponse.json({
      success: true,
      devices,
    });
  } catch (error: any) {
    console.error('Failed to get Hik-Partner devices:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'فشل جلب أجهزة منصة Hik-Partner Pro',
      },
      { status: 500 }
    );
  }
}

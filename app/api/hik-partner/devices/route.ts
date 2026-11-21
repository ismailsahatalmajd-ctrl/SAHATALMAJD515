import { NextResponse } from 'next/server';
import { getPartnerDevices } from '@/lib/hik-partner-pro';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const devices = await getPartnerDevices();

    // Ensure the 16-channel DVR (GK0622137) is available for seamless multi-device switching
    const hasWarehouse = devices.some((d) => d.deviceSerial === 'GK0622137');
    if (!hasWarehouse) {
      devices.push({
        id: 'gk0622137_warehouse_dvr',
        deviceName: 'iDS-7216HUHI-M2/XT(GK0622137)',
        deviceOnlineStatus: 1,
        deviceSerial: 'GK0622137',
        deviceVersion: 'V4.84.002 build 250922',
        deviceType: 'iDS-7216HUHI-M2/XT',
        siteID: 'warehouse_site',
        siteName: 'مستودع الكاميرات الرئيسي (16 كاميرا)',
        totalChannels: 16,
      });
    }

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

export const WAREHOUSE_MAPPING: Record<string, string> = {
    'JDDMM/Stock': '14000 - Jadeel Dammam W.H',
    'MHMSA/Stock': '34000 - Al-Mahmasa (Roastery) W.H',
    'JDSWD/Stock': '11000 - Jadeel Al-Suwaidi W.H',
    'HNANS/Stock': '30000 - Hanoverian Anas W.H',
    'JDQRT/Stock': '12000 - Jadeel Qurtuba W.H',
    'HNVIA/Stock': '29000 - Hanoverian Via Riyadh W.H',
    'CTRWH/Stock': '36000 - Catering W.H',
    'JDKSL/Stock': '13000 - Jadeel King Salman W.H',
    'HNTKH/Stock': '25000 - Hanoverian Takhassusi W.H',
    'JDHAL/Stock': '16000 - Jadeel Hail W.H',
    'JDQSM/Stock': '35000 - Jadeel Qassim W.H',
    'FCTRY/Stock': '04000 - Factory W.H',
    'HNMAM/Stock': '33000 - Hanoverian Mamlaka W.H',
    'HNMKH/Stock': '28000 - Hanoverian Makkah W.H',
    'JDNRJ/Stock': '18000 - Jadeel Al-Narjis W.H',
    'HNDIR/Stock': '32000 - Hanoverian Diriyah W.H',
    'HNKFD/Stock': '26000 - Hanoverian KAFD W.H',
    'JDRWD/Stock': '09000 - Jadeel Al-Rawdah W.H',
    'HNJED/Stock': '27000 - Hanoverian Jeddah W.H',
    'JDABH/Stock': '15000 - Jadeel Abha W.H',
    'JDLBN/Stock': '10000 - Jadeel Laban W.H'
};

export function getWarehouseName(odooName: string | undefined): string {
    if (!odooName) return 'غير محدد';
    // If it matches exactly
    if (WAREHOUSE_MAPPING[odooName]) return WAREHOUSE_MAPPING[odooName];
    
    // Try to find if the full odoo name contains the code (like WH/Stock)
    const matchedKey = Object.keys(WAREHOUSE_MAPPING).find(k => odooName.includes(k));
    if (matchedKey) return WAREHOUSE_MAPPING[matchedKey];
    
    return odooName;
}

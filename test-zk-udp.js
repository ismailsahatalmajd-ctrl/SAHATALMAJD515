const ZKLib = require('node-zklib');

const test = async () => {
    // Try UDP instead of TCP (default is false/TCP)
    // Constructor: ip, port, timeout, inport, udp=false
    let zkInstance = new ZKLib('192.168.8.200', 4370, 10000, 4000, true); 
    try {
        console.log('جاري محاولة الاتصال بجهاز ZKTeco عبر بروتوكول UDP...');
        await zkInstance.createSocket();
        console.log('✅ تم الاتصال (UDP)!');

        console.log('جاري سحب الموظفين...');
        const users = await zkInstance.getUsers();
        console.log('عدد الموظفين:', users.data.length);

        await zkInstance.disconnect();
    } catch (e) {
        console.error('❌ فشل الاتصال عبر UDP:', e);
    }
}

test();

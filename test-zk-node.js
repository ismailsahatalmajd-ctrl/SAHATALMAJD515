const ZKLib = require('node-zklib');

const test = async () => {
    let zkInstance = new ZKLib('192.168.8.200', 4370, 10000, 4000);
    try {
        console.log('جاري الاتصال بجهاز ZKTeco باستخدام node-zklib...');
        // Create socket control
        await zkInstance.createSocket();
        console.log('✅ تم الاتصال بنجاح!');

        // Get users
        console.log('جاري سحب الموظفين...');
        const users = await zkInstance.getUsers();
        console.log('عدد الموظفين:', users.data.length);

        // Get logs
        console.log('جاري سحب سجلات الحضور...');
        const attendances = await zkInstance.getAttendances();
        console.log('عدد السجلات:', attendances.data.length);

        if (attendances.data.length > 0) {
            console.log('آخر سجل:', attendances.data[attendances.data.length - 1]);
        }

        await zkInstance.disconnect();
    } catch (e) {
        console.error('❌ خطأ في الاتصال أو سحب البيانات:', e);
    }
}

test();

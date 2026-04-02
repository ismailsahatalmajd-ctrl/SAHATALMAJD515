const ZKLib = require('zklib-js');

const test = async () => {
    // connect to IP: 192.168.8.200, Port: 4370 
    let zkInstance = new ZKLib('192.168.8.200', 4370, 10000, 4000);
    try {
        console.log('جاري الاتصال بجهاز البصمة لجلب البيانات...');
        await zkInstance.createSocket();
        console.log('✅ تم الاتصال!');
        
        console.log('جاري الطلب: سحب الموظفين المُسجّلين (Users)...');
        const users = await zkInstance.getUsers();
        console.log('تم العثور على (' + (users.data ? users.data.length : 0) + ') موظفين مسجلين في الجهاز.');
        
        console.log('جاري الطلب: سحب سجلات الحركات (Attendances)...');
        const logs = await zkInstance.getAttendances();
        console.log('تم العثور على (' + (logs.data ? logs.data.length : 0) + ') سجل للحركة.');
        
        if (logs.data && logs.data.length > 0) {
            console.log('\nنموذج لآخر بصمة مسجلة في الجهاز:');
            console.log(logs.data[logs.data.length - 1]);
        }
        
        await zkInstance.disconnect();
    } catch (e) {
        console.error('❌ حدث خطأ:', e);
    }
}

test();
